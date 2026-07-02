REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.publish_changelog(text, text, uuid[]) FROM anon, PUBLIC;