


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE EXTENSION IF NOT EXISTS "pg_net" WITH SCHEMA "extensions";






COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_graphql" WITH SCHEMA "graphql";






CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE TYPE "public"."join_request_status" AS ENUM (
    'pending',
    'approved',
    'rejected'
);


ALTER TYPE "public"."join_request_status" OWNER TO "postgres";


CREATE TYPE "public"."user_role" AS ENUM (
    'admin',
    'teacher',
    'student'
);


ALTER TYPE "public"."user_role" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."classes_set_invite_code"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  IF NEW.invite_code IS NULL OR NEW.invite_code = '' THEN
    NEW.invite_code := public.generate_invite_code();
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."classes_set_invite_code"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."decide_join_request"("p_request_id" "uuid", "p_approve" boolean) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_request public.class_join_requests%ROWTYPE;
  v_user    uuid := auth.uid();
BEGIN
  SELECT * INTO v_request
  FROM public.class_join_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'request not found';
  END IF;

  IF NOT public.is_class_teacher(v_user, v_request.class_id) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  IF v_request.status <> 'pending' THEN
    RAISE EXCEPTION 'request already decided';
  END IF;

  IF p_approve THEN
    INSERT INTO public.class_enrollments (class_id, student_id)
    VALUES (v_request.class_id, v_request.student_id)
    ON CONFLICT DO NOTHING;

    UPDATE public.class_join_requests
    SET status = 'approved', decided_at = now(), decided_by = v_user
    WHERE id = p_request_id;
  ELSE
    UPDATE public.class_join_requests
    SET status = 'rejected', decided_at = now(), decided_by = v_user
    WHERE id = p_request_id;
  END IF;
END;
$$;


ALTER FUNCTION "public"."decide_join_request"("p_request_id" "uuid", "p_approve" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."generate_invite_code"() RETURNS "text"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  alphabet  TEXT := 'abcdefghjkmnpqrstuvwxyz23456789';  -- no 0,o,1,l,i
  result    TEXT;
  i         INT;
  attempt   INT := 0;
BEGIN
  LOOP
    result := '';
    FOR i IN 1..7 LOOP
      result := result || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    END LOOP;

    -- Check uniqueness against existing classes
    IF NOT EXISTS (SELECT 1 FROM public.classes WHERE invite_code = result) THEN
      RETURN result;
    END IF;

    attempt := attempt + 1;
    IF attempt >= 5 THEN
      RAISE EXCEPTION 'Could not generate unique invite code after 5 attempts';
    END IF;
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."generate_invite_code"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_user_role"("user_id" "uuid") RETURNS "public"."user_role"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT role FROM public.profiles WHERE id = user_id;
$$;


ALTER FUNCTION "public"."get_user_role"("user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, username, avatar_url, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    split_part(NEW.email, '@', 1),
    NEW.raw_user_meta_data->>'avatar_url',
    'student' -- Default role; admin will update later
  );
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_class_teacher"("p_class_id" "uuid", "p_user_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.classes
    WHERE id = p_class_id AND teacher_id = p_user_id
  );
$$;


ALTER FUNCTION "public"."is_class_teacher"("p_class_id" "uuid", "p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."regenerate_class_invite_code"("p_class_id" "uuid", "p_expires_in_hours" integer DEFAULT 168) RETURNS TABLE("invite_code" "text", "invite_code_expires_at" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_new_code text;
  v_expires  timestamptz;
BEGIN
  -- Authorization: caller must be the teacher of the class
  IF NOT public.is_class_teacher(auth.uid(), p_class_id) THEN
    RAISE EXCEPTION 'not authorized to regenerate invite code for this class';
  END IF;

  v_new_code := public.generate_invite_code();
  v_expires  := CASE
                  WHEN p_expires_in_hours IS NULL THEN NULL
                  ELSE now() + make_interval(hours => p_expires_in_hours)
                END;

  UPDATE public.classes
  SET invite_code            = v_new_code,
      invite_code_expires_at = v_expires,
      invite_code_disabled   = false,
      updated_at             = now()
  WHERE id = p_class_id;

  RETURN QUERY
  SELECT v_new_code, v_expires;
END;
$$;


ALTER FUNCTION "public"."regenerate_class_invite_code"("p_class_id" "uuid", "p_expires_in_hours" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."request_join_class_by_code"("p_code" "text") RETURNS TABLE("class_id" "uuid", "status" "public"."join_request_status", "message" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_class   public.classes%ROWTYPE;
  v_user    uuid := auth.uid();
  v_role    public.user_role;
  v_existing_request public.class_join_requests%ROWTYPE;
  v_already_enrolled boolean;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  v_role := public.get_user_role(v_user);
  IF v_role <> 'student' THEN
    RAISE EXCEPTION 'only students can join classes by code';
  END IF;

  -- Look up the class (case-insensitive on code, codes are lowercase already)
  SELECT * INTO v_class
  FROM public.classes
  WHERE lower(invite_code) = lower(trim(p_code))
    AND is_archived = false
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'invalid invite code';
  END IF;

  IF v_class.invite_code_disabled THEN
    RAISE EXCEPTION 'invite code is disabled';
  END IF;

  IF v_class.invite_code_expires_at IS NOT NULL
     AND v_class.invite_code_expires_at < now() THEN
    RAISE EXCEPTION 'invite code has expired';
  END IF;

  -- Already enrolled?
  SELECT EXISTS (
    SELECT 1 FROM public.class_enrollments
    WHERE class_id = v_class.id AND student_id = v_user
  ) INTO v_already_enrolled;

  IF v_already_enrolled THEN
    RETURN QUERY SELECT v_class.id, 'approved'::public.join_request_status,
                        'already enrolled'::text;
    RETURN;
  END IF;

  -- Existing pending request?
  SELECT * INTO v_existing_request
  FROM public.class_join_requests
  WHERE class_id = v_class.id
    AND student_id = v_user
    AND status = 'pending'
  LIMIT 1;

  IF FOUND THEN
    RETURN QUERY SELECT v_class.id, v_existing_request.status,
                        'request already pending'::text;
    RETURN;
  END IF;

  -- Insert new pending request
  INSERT INTO public.class_join_requests (class_id, student_id, status)
  VALUES (v_class.id, v_user, 'pending');

  RETURN QUERY SELECT v_class.id, 'pending'::public.join_request_status,
                      'request submitted'::text;
END;
$$;


ALTER FUNCTION "public"."request_join_class_by_code"("p_code" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."set_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_updated_at_column"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_updated_at_column"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."class_enrollments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "class_id" "uuid" NOT NULL,
    "student_id" "uuid" NOT NULL,
    "enrolled_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."class_enrollments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."class_join_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "class_id" "uuid" NOT NULL,
    "student_id" "uuid" NOT NULL,
    "status" "public"."join_request_status" DEFAULT 'pending'::"public"."join_request_status" NOT NULL,
    "requested_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "decided_at" timestamp with time zone,
    "decided_by" "uuid"
);


ALTER TABLE "public"."class_join_requests" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."classes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "teacher_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "section" "text",
    "semester" "text" NOT NULL,
    "description" "text",
    "color" "text" DEFAULT '#dc2626'::"text" NOT NULL,
    "invite_code" "text" NOT NULL,
    "is_archived" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "cover_photo_url" "text",
    "invite_code_expires_at" timestamp with time zone,
    "invite_code_disabled" boolean DEFAULT false NOT NULL,
    CONSTRAINT "classes_semester_check" CHECK (("semester" = ANY (ARRAY['1st Semester'::"text", '2nd Semester'::"text"])))
);


ALTER TABLE "public"."classes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "email" "text" NOT NULL,
    "full_name" "text",
    "username" "text",
    "avatar_url" "text",
    "role" "public"."user_role" DEFAULT 'student'::"public"."user_role" NOT NULL,
    "institution" "text" DEFAULT 'Arkadian Institution'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


ALTER TABLE ONLY "public"."class_enrollments"
    ADD CONSTRAINT "class_enrollments_class_id_student_id_key" UNIQUE ("class_id", "student_id");



ALTER TABLE ONLY "public"."class_enrollments"
    ADD CONSTRAINT "class_enrollments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."class_join_requests"
    ADD CONSTRAINT "class_join_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."class_join_requests"
    ADD CONSTRAINT "class_join_requests_unique_pending" EXCLUDE USING "btree" ("class_id" WITH =, "student_id" WITH =) WHERE (("status" = 'pending'::"public"."join_request_status"));



ALTER TABLE ONLY "public"."classes"
    ADD CONSTRAINT "classes_invite_code_key" UNIQUE ("invite_code");



ALTER TABLE ONLY "public"."classes"
    ADD CONSTRAINT "classes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_email_key" UNIQUE ("email");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_username_key" UNIQUE ("username");



CREATE INDEX "class_enrollments_class_id_idx" ON "public"."class_enrollments" USING "btree" ("class_id");



CREATE INDEX "class_enrollments_student_id_idx" ON "public"."class_enrollments" USING "btree" ("student_id");



CREATE UNIQUE INDEX "class_enrollments_unique_pair" ON "public"."class_enrollments" USING "btree" ("class_id", "student_id");



CREATE INDEX "class_join_requests_class_idx" ON "public"."class_join_requests" USING "btree" ("class_id", "status");



CREATE INDEX "class_join_requests_student_idx" ON "public"."class_join_requests" USING "btree" ("student_id", "status");



CREATE INDEX "classes_invite_code_idx" ON "public"."classes" USING "btree" ("invite_code");



CREATE INDEX "classes_is_archived_idx" ON "public"."classes" USING "btree" ("is_archived");



CREATE INDEX "classes_teacher_id_idx" ON "public"."classes" USING "btree" ("teacher_id");



CREATE INDEX "classes_teacher_section_idx" ON "public"."classes" USING "btree" ("teacher_id", "section");



CREATE OR REPLACE TRIGGER "classes_set_invite_code_trigger" BEFORE INSERT ON "public"."classes" FOR EACH ROW EXECUTE FUNCTION "public"."classes_set_invite_code"();



CREATE OR REPLACE TRIGGER "classes_updated_at_trigger" BEFORE UPDATE ON "public"."classes" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "update_profiles_updated_at" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



ALTER TABLE ONLY "public"."class_enrollments"
    ADD CONSTRAINT "class_enrollments_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."class_enrollments"
    ADD CONSTRAINT "class_enrollments_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."class_join_requests"
    ADD CONSTRAINT "class_join_requests_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."class_join_requests"
    ADD CONSTRAINT "class_join_requests_decided_by_fkey" FOREIGN KEY ("decided_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."class_join_requests"
    ADD CONSTRAINT "class_join_requests_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."classes"
    ADD CONSTRAINT "classes_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



CREATE POLICY "Admins can delete profiles" ON "public"."profiles" FOR DELETE USING (("public"."get_user_role"("auth"."uid"()) = 'admin'::"public"."user_role"));



CREATE POLICY "Admins can insert profiles" ON "public"."profiles" FOR INSERT WITH CHECK (("public"."get_user_role"("auth"."uid"()) = 'admin'::"public"."user_role"));



CREATE POLICY "Admins can update all profiles" ON "public"."profiles" FOR UPDATE USING (("public"."get_user_role"("auth"."uid"()) = 'admin'::"public"."user_role"));



CREATE POLICY "Admins can view all profiles" ON "public"."profiles" FOR SELECT USING (("public"."get_user_role"("auth"."uid"()) = 'admin'::"public"."user_role"));



CREATE POLICY "Users can update own profile" ON "public"."profiles" FOR UPDATE USING (("auth"."uid"() = "id"));



CREATE POLICY "Users can view own profile" ON "public"."profiles" FOR SELECT USING (("auth"."uid"() = "id"));



ALTER TABLE "public"."class_enrollments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."class_join_requests" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "class_join_requests_delete_admin" ON "public"."class_join_requests" FOR DELETE TO "authenticated" USING (("public"."get_user_role"("auth"."uid"()) = 'admin'::"public"."user_role"));



CREATE POLICY "class_join_requests_delete_own_pending" ON "public"."class_join_requests" FOR DELETE TO "authenticated" USING ((("student_id" = "auth"."uid"()) AND ("status" = 'pending'::"public"."join_request_status")));



CREATE POLICY "class_join_requests_insert_admin" ON "public"."class_join_requests" FOR INSERT TO "authenticated" WITH CHECK (("public"."get_user_role"("auth"."uid"()) = 'admin'::"public"."user_role"));



CREATE POLICY "class_join_requests_select_admin" ON "public"."class_join_requests" FOR SELECT TO "authenticated" USING (("public"."get_user_role"("auth"."uid"()) = 'admin'::"public"."user_role"));



CREATE POLICY "class_join_requests_select_own" ON "public"."class_join_requests" FOR SELECT TO "authenticated" USING (("student_id" = "auth"."uid"()));



CREATE POLICY "class_join_requests_select_teacher" ON "public"."class_join_requests" FOR SELECT TO "authenticated" USING ("public"."is_class_teacher"("auth"."uid"(), "class_id"));



CREATE POLICY "class_join_requests_update_admin" ON "public"."class_join_requests" FOR UPDATE TO "authenticated" USING (("public"."get_user_role"("auth"."uid"()) = 'admin'::"public"."user_role")) WITH CHECK (("public"."get_user_role"("auth"."uid"()) = 'admin'::"public"."user_role"));



CREATE POLICY "class_join_requests_update_teacher" ON "public"."class_join_requests" FOR UPDATE TO "authenticated" USING ("public"."is_class_teacher"("auth"."uid"(), "class_id")) WITH CHECK ("public"."is_class_teacher"("auth"."uid"(), "class_id"));



ALTER TABLE "public"."classes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "classes_admin_all" ON "public"."classes" TO "authenticated" USING (("public"."get_user_role"("auth"."uid"()) = 'admin'::"public"."user_role")) WITH CHECK (("public"."get_user_role"("auth"."uid"()) = 'admin'::"public"."user_role"));



CREATE POLICY "classes_delete_teacher" ON "public"."classes" FOR DELETE TO "authenticated" USING ("public"."is_class_teacher"("id", "auth"."uid"()));



CREATE POLICY "classes_insert_teacher" ON "public"."classes" FOR INSERT TO "authenticated" WITH CHECK ((("teacher_id" = "auth"."uid"()) AND ("public"."get_user_role"("auth"."uid"()) = 'teacher'::"public"."user_role")));



CREATE POLICY "classes_select_admin" ON "public"."classes" FOR SELECT TO "authenticated" USING (("public"."get_user_role"("auth"."uid"()) = 'admin'::"public"."user_role"));



CREATE POLICY "classes_select_enrolled_student" ON "public"."classes" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."class_enrollments"
  WHERE (("class_enrollments"."class_id" = "classes"."id") AND ("class_enrollments"."student_id" = "auth"."uid"())))));



CREATE POLICY "classes_select_teacher" ON "public"."classes" FOR SELECT TO "authenticated" USING ("public"."is_class_teacher"("id", "auth"."uid"()));



CREATE POLICY "classes_update_teacher" ON "public"."classes" FOR UPDATE TO "authenticated" USING ("public"."is_class_teacher"("id", "auth"."uid"())) WITH CHECK ("public"."is_class_teacher"("id", "auth"."uid"()));



CREATE POLICY "enrollments_delete_self" ON "public"."class_enrollments" FOR DELETE TO "authenticated" USING (("student_id" = "auth"."uid"()));



CREATE POLICY "enrollments_delete_teacher" ON "public"."class_enrollments" FOR DELETE TO "authenticated" USING ("public"."is_class_teacher"("class_id", "auth"."uid"()));



CREATE POLICY "enrollments_insert_self" ON "public"."class_enrollments" FOR INSERT TO "authenticated" WITH CHECK ((("student_id" = "auth"."uid"()) AND ("public"."get_user_role"("auth"."uid"()) = 'student'::"public"."user_role")));



CREATE POLICY "enrollments_select_admin" ON "public"."class_enrollments" FOR SELECT TO "authenticated" USING (("public"."get_user_role"("auth"."uid"()) = 'admin'::"public"."user_role"));



CREATE POLICY "enrollments_select_self" ON "public"."class_enrollments" FOR SELECT TO "authenticated" USING (("student_id" = "auth"."uid"()));



CREATE POLICY "enrollments_select_teacher" ON "public"."class_enrollments" FOR SELECT TO "authenticated" USING ("public"."is_class_teacher"("class_id", "auth"."uid"()));



ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "profiles_staff_view" ON "public"."profiles" FOR SELECT TO "authenticated" USING (("public"."get_user_role"("auth"."uid"()) = ANY (ARRAY['admin'::"public"."user_role", 'teacher'::"public"."user_role"])));





ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";





GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";































































































































































GRANT ALL ON FUNCTION "public"."classes_set_invite_code"() TO "anon";
GRANT ALL ON FUNCTION "public"."classes_set_invite_code"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."classes_set_invite_code"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."decide_join_request"("p_request_id" "uuid", "p_approve" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."decide_join_request"("p_request_id" "uuid", "p_approve" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."decide_join_request"("p_request_id" "uuid", "p_approve" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."decide_join_request"("p_request_id" "uuid", "p_approve" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."generate_invite_code"() TO "anon";
GRANT ALL ON FUNCTION "public"."generate_invite_code"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."generate_invite_code"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_user_role"("user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_user_role"("user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_user_role"("user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_class_teacher"("p_class_id" "uuid", "p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_class_teacher"("p_class_id" "uuid", "p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_class_teacher"("p_class_id" "uuid", "p_user_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."regenerate_class_invite_code"("p_class_id" "uuid", "p_expires_in_hours" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."regenerate_class_invite_code"("p_class_id" "uuid", "p_expires_in_hours" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."regenerate_class_invite_code"("p_class_id" "uuid", "p_expires_in_hours" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."regenerate_class_invite_code"("p_class_id" "uuid", "p_expires_in_hours" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."request_join_class_by_code"("p_code" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."request_join_class_by_code"("p_code" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."request_join_class_by_code"("p_code" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."request_join_class_by_code"("p_code" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "service_role";


















GRANT ALL ON TABLE "public"."class_enrollments" TO "anon";
GRANT ALL ON TABLE "public"."class_enrollments" TO "authenticated";
GRANT ALL ON TABLE "public"."class_enrollments" TO "service_role";



GRANT ALL ON TABLE "public"."class_join_requests" TO "anon";
GRANT ALL ON TABLE "public"."class_join_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."class_join_requests" TO "service_role";



GRANT ALL ON TABLE "public"."classes" TO "anon";
GRANT ALL ON TABLE "public"."classes" TO "authenticated";
GRANT ALL ON TABLE "public"."classes" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";
































--
-- Dumped schema changes for auth and storage
--

CREATE OR REPLACE TRIGGER "on_auth_user_created" AFTER INSERT ON "auth"."users" FOR EACH ROW EXECUTE FUNCTION "public"."handle_new_user"();



