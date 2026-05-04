import { pgTable, foreignKey, unique, pgPolicy, uuid, text, timestamp, index, uniqueIndex, check, boolean, pgEnum } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"

export const joinRequestStatus = pgEnum("join_request_status", ['pending', 'approved', 'rejected'])
export const userRole = pgEnum("user_role", ['admin', 'teacher', 'student'])


export const profiles = pgTable("profiles", {
	id: uuid().primaryKey().notNull(),
	email: text().notNull(),
	fullName: text("full_name"),
	username: text(),
	avatarUrl: text("avatar_url"),
	role: userRole().default('student').notNull(),
	institution: text().default('Arkadian Institution'),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	foreignKey({
			columns: [table.id],
			foreignColumns: [users.id],
			name: "profiles_id_fkey"
		}).onDelete("cascade"),
	unique("profiles_email_key").on(table.email),
	unique("profiles_username_key").on(table.username),
	pgPolicy("Users can view own profile", { as: "permissive", for: "select", to: ["public"], using: sql`(auth.uid() = id)` }),
	pgPolicy("Users can update own profile", { as: "permissive", for: "update", to: ["public"] }),
	pgPolicy("Admins can view all profiles", { as: "permissive", for: "select", to: ["public"] }),
	pgPolicy("Admins can insert profiles", { as: "permissive", for: "insert", to: ["public"] }),
	pgPolicy("Admins can update all profiles", { as: "permissive", for: "update", to: ["public"] }),
	pgPolicy("Admins can delete profiles", { as: "permissive", for: "delete", to: ["public"] }),
	pgPolicy("profiles_staff_view", { as: "permissive", for: "select", to: ["authenticated"] }),
]);

export const classEnrollments = pgTable("class_enrollments", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	classId: uuid("class_id").notNull(),
	studentId: uuid("student_id").notNull(),
	enrolledAt: timestamp("enrolled_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("class_enrollments_class_id_idx").using("btree", table.classId.asc().nullsLast().op("uuid_ops")),
	index("class_enrollments_student_id_idx").using("btree", table.studentId.asc().nullsLast().op("uuid_ops")),
	uniqueIndex("class_enrollments_unique_pair").using("btree", table.classId.asc().nullsLast().op("uuid_ops"), table.studentId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.classId],
			foreignColumns: [classes.id],
			name: "class_enrollments_class_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.studentId],
			foreignColumns: [profiles.id],
			name: "class_enrollments_student_id_fkey"
		}).onDelete("cascade"),
	unique("class_enrollments_class_id_student_id_key").on(table.classId, table.studentId),
	pgPolicy("enrollments_select_teacher", { as: "permissive", for: "select", to: ["authenticated"], using: sql`is_class_teacher(class_id, auth.uid())` }),
	pgPolicy("enrollments_select_self", { as: "permissive", for: "select", to: ["authenticated"] }),
	pgPolicy("enrollments_select_admin", { as: "permissive", for: "select", to: ["authenticated"] }),
	pgPolicy("enrollments_insert_self", { as: "permissive", for: "insert", to: ["authenticated"] }),
	pgPolicy("enrollments_delete_teacher", { as: "permissive", for: "delete", to: ["authenticated"] }),
	pgPolicy("enrollments_delete_self", { as: "permissive", for: "delete", to: ["authenticated"] }),
]);

export const classes = pgTable("classes", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	teacherId: uuid("teacher_id").notNull(),
	name: text().notNull(),
	section: text(),
	semester: text().notNull(),
	description: text(),
	color: text().default('#dc2626').notNull(),
	inviteCode: text("invite_code").notNull(),
	isArchived: boolean("is_archived").default(false).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	coverPhotoUrl: text("cover_photo_url"),
	inviteCodeExpiresAt: timestamp("invite_code_expires_at", { withTimezone: true, mode: 'string' }),
	inviteCodeDisabled: boolean("invite_code_disabled").default(false).notNull(),
}, (table) => [
	index("classes_invite_code_idx").using("btree", table.inviteCode.asc().nullsLast().op("text_ops")),
	index("classes_is_archived_idx").using("btree", table.isArchived.asc().nullsLast().op("bool_ops")),
	index("classes_teacher_id_idx").using("btree", table.teacherId.asc().nullsLast().op("uuid_ops")),
	index("classes_teacher_section_idx").using("btree", table.teacherId.asc().nullsLast().op("text_ops"), table.section.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.teacherId],
			foreignColumns: [profiles.id],
			name: "classes_teacher_id_fkey"
		}).onDelete("cascade"),
	unique("classes_invite_code_key").on(table.inviteCode),
	pgPolicy("classes_select_teacher", { as: "permissive", for: "select", to: ["authenticated"], using: sql`is_class_teacher(id, auth.uid())` }),
	pgPolicy("classes_select_enrolled_student", { as: "permissive", for: "select", to: ["authenticated"] }),
	pgPolicy("classes_select_admin", { as: "permissive", for: "select", to: ["authenticated"] }),
	pgPolicy("classes_update_teacher", { as: "permissive", for: "update", to: ["authenticated"] }),
	pgPolicy("classes_delete_teacher", { as: "permissive", for: "delete", to: ["authenticated"] }),
	pgPolicy("classes_admin_all", { as: "permissive", for: "all", to: ["authenticated"] }),
	pgPolicy("classes_insert_teacher", { as: "permissive", for: "insert", to: ["authenticated"] }),
	check("classes_semester_check", sql`semester = ANY (ARRAY['1st Semester'::text, '2nd Semester'::text])`),
]);

export const classJoinRequests = pgTable("class_join_requests", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	classId: uuid("class_id").notNull(),
	studentId: uuid("student_id").notNull(),
	status: joinRequestStatus().default('pending').notNull(),
	requestedAt: timestamp("requested_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	decidedAt: timestamp("decided_at", { withTimezone: true, mode: 'string' }),
	decidedBy: uuid("decided_by"),
}, (table) => [
	index("class_join_requests_class_idx").using("btree", table.classId.asc().nullsLast().op("enum_ops"), table.status.asc().nullsLast().op("enum_ops")),
	index("class_join_requests_student_idx").using("btree", table.studentId.asc().nullsLast().op("uuid_ops"), table.status.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.classId],
			foreignColumns: [classes.id],
			name: "class_join_requests_class_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.studentId],
			foreignColumns: [profiles.id],
			name: "class_join_requests_student_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.decidedBy],
			foreignColumns: [profiles.id],
			name: "class_join_requests_decided_by_fkey"
		}).onDelete("set null"),
	pgPolicy("class_join_requests_select_own", { as: "permissive", for: "select", to: ["authenticated"], using: sql`(student_id = auth.uid())` }),
	pgPolicy("class_join_requests_select_teacher", { as: "permissive", for: "select", to: ["authenticated"] }),
	pgPolicy("class_join_requests_select_admin", { as: "permissive", for: "select", to: ["authenticated"] }),
	pgPolicy("class_join_requests_insert_admin", { as: "permissive", for: "insert", to: ["authenticated"] }),
	pgPolicy("class_join_requests_update_teacher", { as: "permissive", for: "update", to: ["authenticated"] }),
	pgPolicy("class_join_requests_update_admin", { as: "permissive", for: "update", to: ["authenticated"] }),
	pgPolicy("class_join_requests_delete_own_pending", { as: "permissive", for: "delete", to: ["authenticated"] }),
	pgPolicy("class_join_requests_delete_admin", { as: "permissive", for: "delete", to: ["authenticated"] }),
]);
