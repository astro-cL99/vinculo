
-- ============= ROLES =============
CREATE TYPE public.app_role AS ENUM ('admin', 'editor', 'viewer');

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

CREATE POLICY "Users see own roles" ON public.user_roles
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins manage roles" ON public.user_roles
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ============= FEEDBACK =============
CREATE TABLE public.feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  type text NOT NULL CHECK (type IN ('bug','idea','usability','clinical','performance','other')),
  severity text NOT NULL DEFAULT 'med' CHECK (severity IN ('low','med','high','critical')),
  title text NOT NULL CHECK (char_length(trim(title)) BETWEEN 3 AND 200),
  description text NOT NULL CHECK (char_length(trim(description)) BETWEEN 5 AND 4000),
  ext_version text,
  ruleset_composite text,
  role text,
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new','triaged','in_progress','done','wontfix')),
  admin_notes text,
  source text NOT NULL DEFAULT 'extension',
  user_agent text
);

ALTER TABLE public.feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can submit feedback" ON public.feedback
  FOR INSERT TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Admins read all feedback" ON public.feedback
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins update feedback" ON public.feedback
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins delete feedback" ON public.feedback
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_feedback_status ON public.feedback(status);
CREATE INDEX idx_feedback_created ON public.feedback(created_at DESC);

-- ============= CHANGELOG =============
CREATE TABLE public.changelog_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version text NOT NULL UNIQUE,
  semver_type text NOT NULL CHECK (semver_type IN ('major','minor','patch')),
  summary text NOT NULL CHECK (char_length(trim(summary)) BETWEEN 3 AND 2000),
  published_at timestamptz NOT NULL DEFAULT now(),
  published_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.changelog_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view changelog" ON public.changelog_entries
  FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "Admins manage changelog" ON public.changelog_entries
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.changelog_items (
  changelog_id uuid NOT NULL REFERENCES public.changelog_entries(id) ON DELETE CASCADE,
  feedback_id uuid NOT NULL REFERENCES public.feedback(id) ON DELETE CASCADE,
  PRIMARY KEY (changelog_id, feedback_id)
);

ALTER TABLE public.changelog_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view changelog items" ON public.changelog_items
  FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "Admins manage changelog items" ON public.changelog_items
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ============= TRIGGERS =============
CREATE OR REPLACE FUNCTION public.feedback_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_feedback_updated_at
BEFORE UPDATE ON public.feedback
FOR EACH ROW EXECUTE FUNCTION public.feedback_set_updated_at();

-- ============= PUBLISH FUNCTION (admin only, atomic semver bump) =============
CREATE OR REPLACE FUNCTION public.publish_changelog(
  _semver_type text,
  _summary text,
  _feedback_ids uuid[]
)
RETURNS TABLE (id uuid, version text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _last text;
  _major int := 1;
  _minor int := 0;
  _patch int := 0;
  _next text;
  _entry_id uuid;
  _fid uuid;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Forbidden: admin role required';
  END IF;
  IF _semver_type NOT IN ('major','minor','patch') THEN
    RAISE EXCEPTION 'Invalid semver_type';
  END IF;

  SELECT version INTO _last FROM public.changelog_entries
   ORDER BY created_at DESC LIMIT 1;

  IF _last IS NOT NULL AND _last ~ '^v?[0-9]+\.[0-9]+\.[0-9]+$' THEN
    _major := split_part(regexp_replace(_last, '^v', ''), '.', 1)::int;
    _minor := split_part(regexp_replace(_last, '^v', ''), '.', 2)::int;
    _patch := split_part(regexp_replace(_last, '^v', ''), '.', 3)::int;
  END IF;

  IF _semver_type = 'major' THEN
    _major := _major + 1; _minor := 0; _patch := 0;
  ELSIF _semver_type = 'minor' THEN
    _minor := _minor + 1; _patch := 0;
  ELSE
    _patch := _patch + 1;
  END IF;

  _next := _major || '.' || _minor || '.' || _patch;

  INSERT INTO public.changelog_entries(version, semver_type, summary, published_by)
  VALUES (_next, _semver_type, _summary, auth.uid())
  RETURNING changelog_entries.id INTO _entry_id;

  IF _feedback_ids IS NOT NULL THEN
    FOREACH _fid IN ARRAY _feedback_ids LOOP
      INSERT INTO public.changelog_items(changelog_id, feedback_id)
      VALUES (_entry_id, _fid) ON CONFLICT DO NOTHING;
      UPDATE public.feedback SET status = 'done' WHERE id = _fid;
    END LOOP;
  END IF;

  RETURN QUERY SELECT _entry_id, _next;
END;
$$;
