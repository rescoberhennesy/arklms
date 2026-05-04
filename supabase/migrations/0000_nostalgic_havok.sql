-- Current sql file was generated after introspecting the database
-- If you want to run this migration please uncomment this code before executing migrations
/*
CREATE TYPE "public"."join_request_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('admin', 'teacher', 'student');--> statement-breakpoint
CREATE TABLE "profiles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"full_name" text,
	"username" text,
	"avatar_url" text,
	"role" "user_role" DEFAULT 'student' NOT NULL,
	"institution" text DEFAULT 'Arkadian Institution',
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "profiles_email_key" UNIQUE("email"),
	CONSTRAINT "profiles_username_key" UNIQUE("username")
);
--> statement-breakpoint
ALTER TABLE "profiles" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "class_enrollments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"class_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"enrolled_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "class_enrollments_class_id_student_id_key" UNIQUE("class_id","student_id")
);
--> statement-breakpoint
ALTER TABLE "class_enrollments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "classes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"teacher_id" uuid NOT NULL,
	"name" text NOT NULL,
	"section" text,
	"semester" text NOT NULL,
	"description" text,
	"color" text DEFAULT '#dc2626' NOT NULL,
	"invite_code" text NOT NULL,
	"is_archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"cover_photo_url" text,
	"invite_code_expires_at" timestamp with time zone,
	"invite_code_disabled" boolean DEFAULT false NOT NULL,
	CONSTRAINT "classes_invite_code_key" UNIQUE("invite_code"),
	CONSTRAINT "classes_semester_check" CHECK (semester = ANY (ARRAY['1st Semester'::text, '2nd Semester'::text]))
);
--> statement-breakpoint
ALTER TABLE "classes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "class_join_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"class_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"status" "join_request_status" DEFAULT 'pending' NOT NULL,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_at" timestamp with time zone,
	"decided_by" uuid
);
--> statement-breakpoint
ALTER TABLE "class_join_requests" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_enrollments" ADD CONSTRAINT "class_enrollments_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_enrollments" ADD CONSTRAINT "class_enrollments_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "classes" ADD CONSTRAINT "classes_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_join_requests" ADD CONSTRAINT "class_join_requests_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_join_requests" ADD CONSTRAINT "class_join_requests_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_join_requests" ADD CONSTRAINT "class_join_requests_decided_by_fkey" FOREIGN KEY ("decided_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "class_enrollments_class_id_idx" ON "class_enrollments" USING btree ("class_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "class_enrollments_student_id_idx" ON "class_enrollments" USING btree ("student_id" uuid_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "class_enrollments_unique_pair" ON "class_enrollments" USING btree ("class_id" uuid_ops,"student_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "classes_invite_code_idx" ON "classes" USING btree ("invite_code" text_ops);--> statement-breakpoint
CREATE INDEX "classes_is_archived_idx" ON "classes" USING btree ("is_archived" bool_ops);--> statement-breakpoint
CREATE INDEX "classes_teacher_id_idx" ON "classes" USING btree ("teacher_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "classes_teacher_section_idx" ON "classes" USING btree ("teacher_id" text_ops,"section" text_ops);--> statement-breakpoint
CREATE INDEX "class_join_requests_class_idx" ON "class_join_requests" USING btree ("class_id" enum_ops,"status" enum_ops);--> statement-breakpoint
CREATE INDEX "class_join_requests_student_idx" ON "class_join_requests" USING btree ("student_id" uuid_ops,"status" uuid_ops);--> statement-breakpoint
CREATE POLICY "Users can view own profile" ON "profiles" AS PERMISSIVE FOR SELECT TO public USING ((auth.uid() = id));--> statement-breakpoint
CREATE POLICY "Users can update own profile" ON "profiles" AS PERMISSIVE FOR UPDATE TO public;--> statement-breakpoint
CREATE POLICY "Admins can view all profiles" ON "profiles" AS PERMISSIVE FOR SELECT TO public;--> statement-breakpoint
CREATE POLICY "Admins can insert profiles" ON "profiles" AS PERMISSIVE FOR INSERT TO public;--> statement-breakpoint
CREATE POLICY "Admins can update all profiles" ON "profiles" AS PERMISSIVE FOR UPDATE TO public;--> statement-breakpoint
CREATE POLICY "Admins can delete profiles" ON "profiles" AS PERMISSIVE FOR DELETE TO public;--> statement-breakpoint
CREATE POLICY "profiles_staff_view" ON "profiles" AS PERMISSIVE FOR SELECT TO "authenticated";--> statement-breakpoint
CREATE POLICY "enrollments_select_teacher" ON "class_enrollments" AS PERMISSIVE FOR SELECT TO "authenticated" USING (is_class_teacher(class_id, auth.uid()));--> statement-breakpoint
CREATE POLICY "enrollments_select_self" ON "class_enrollments" AS PERMISSIVE FOR SELECT TO "authenticated";--> statement-breakpoint
CREATE POLICY "enrollments_select_admin" ON "class_enrollments" AS PERMISSIVE FOR SELECT TO "authenticated";--> statement-breakpoint
CREATE POLICY "enrollments_insert_self" ON "class_enrollments" AS PERMISSIVE FOR INSERT TO "authenticated";--> statement-breakpoint
CREATE POLICY "enrollments_delete_teacher" ON "class_enrollments" AS PERMISSIVE FOR DELETE TO "authenticated";--> statement-breakpoint
CREATE POLICY "enrollments_delete_self" ON "class_enrollments" AS PERMISSIVE FOR DELETE TO "authenticated";--> statement-breakpoint
CREATE POLICY "classes_select_teacher" ON "classes" AS PERMISSIVE FOR SELECT TO "authenticated" USING (is_class_teacher(id, auth.uid()));--> statement-breakpoint
CREATE POLICY "classes_select_enrolled_student" ON "classes" AS PERMISSIVE FOR SELECT TO "authenticated";--> statement-breakpoint
CREATE POLICY "classes_select_admin" ON "classes" AS PERMISSIVE FOR SELECT TO "authenticated";--> statement-breakpoint
CREATE POLICY "classes_update_teacher" ON "classes" AS PERMISSIVE FOR UPDATE TO "authenticated";--> statement-breakpoint
CREATE POLICY "classes_delete_teacher" ON "classes" AS PERMISSIVE FOR DELETE TO "authenticated";--> statement-breakpoint
CREATE POLICY "classes_admin_all" ON "classes" AS PERMISSIVE FOR ALL TO "authenticated";--> statement-breakpoint
CREATE POLICY "classes_insert_teacher" ON "classes" AS PERMISSIVE FOR INSERT TO "authenticated";--> statement-breakpoint
CREATE POLICY "class_join_requests_select_own" ON "class_join_requests" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((student_id = auth.uid()));--> statement-breakpoint
CREATE POLICY "class_join_requests_select_teacher" ON "class_join_requests" AS PERMISSIVE FOR SELECT TO "authenticated";--> statement-breakpoint
CREATE POLICY "class_join_requests_select_admin" ON "class_join_requests" AS PERMISSIVE FOR SELECT TO "authenticated";--> statement-breakpoint
CREATE POLICY "class_join_requests_insert_admin" ON "class_join_requests" AS PERMISSIVE FOR INSERT TO "authenticated";--> statement-breakpoint
CREATE POLICY "class_join_requests_update_teacher" ON "class_join_requests" AS PERMISSIVE FOR UPDATE TO "authenticated";--> statement-breakpoint
CREATE POLICY "class_join_requests_update_admin" ON "class_join_requests" AS PERMISSIVE FOR UPDATE TO "authenticated";--> statement-breakpoint
CREATE POLICY "class_join_requests_delete_own_pending" ON "class_join_requests" AS PERMISSIVE FOR DELETE TO "authenticated";--> statement-breakpoint
CREATE POLICY "class_join_requests_delete_admin" ON "class_join_requests" AS PERMISSIVE FOR DELETE TO "authenticated";
*/