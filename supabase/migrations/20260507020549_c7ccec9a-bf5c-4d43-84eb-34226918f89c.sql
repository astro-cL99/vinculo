
-- Lock down SECURITY DEFINER functions
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.publish_changelog(text, text, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.publish_changelog(text, text, uuid[]) TO authenticated;

-- Replace permissive insert policy with validated one
DROP POLICY IF EXISTS "Anyone can submit feedback" ON public.feedback;

CREATE POLICY "Anyone can submit valid feedback" ON public.feedback
  FOR INSERT TO anon, authenticated
  WITH CHECK (
    type IN ('bug','idea','usability','clinical','performance','other')
    AND severity IN ('low','med','high','critical')
    AND char_length(trim(title)) BETWEEN 3 AND 200
    AND char_length(trim(description)) BETWEEN 5 AND 4000
    AND status = 'new'
    AND admin_notes IS NULL
  );
