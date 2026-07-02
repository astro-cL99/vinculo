CREATE TABLE public.suggestion_votes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  suggestion_id UUID NOT NULL REFERENCES public.suggestions(id) ON DELETE CASCADE,
  voter_fingerprint TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (suggestion_id, voter_fingerprint)
);

CREATE INDEX idx_suggestion_votes_suggestion ON public.suggestion_votes(suggestion_id);

ALTER TABLE public.suggestion_votes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view votes"
ON public.suggestion_votes
FOR SELECT
TO public
USING (true);

CREATE POLICY "Anyone can insert votes"
ON public.suggestion_votes
FOR INSERT
TO public
WITH CHECK (
  char_length(trim(voter_fingerprint)) BETWEEN 6 AND 128
);