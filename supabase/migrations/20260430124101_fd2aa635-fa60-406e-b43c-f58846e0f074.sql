CREATE TABLE public.suggestions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  author TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.suggestions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view suggestions"
  ON public.suggestions FOR SELECT
  USING (true);

CREATE POLICY "Anyone can insert suggestions"
  ON public.suggestions FOR INSERT
  WITH CHECK (
    char_length(trim(author)) BETWEEN 1 AND 80
    AND char_length(trim(message)) BETWEEN 3 AND 2000
  );

CREATE INDEX suggestions_created_at_idx ON public.suggestions (created_at DESC);