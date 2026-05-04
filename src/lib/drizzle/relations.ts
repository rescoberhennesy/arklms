import { relations } from "drizzle-orm/relations";
import { usersInAuth, profiles, classes, classEnrollments, classJoinRequests } from "./schema";

export const profilesRelations = relations(profiles, ({one, many}) => ({
	usersInAuth: one(usersInAuth, {
		fields: [profiles.id],
		references: [usersInAuth.id]
	}),
	classEnrollments: many(classEnrollments),
	classes: many(classes),
	classJoinRequests_studentId: many(classJoinRequests, {
		relationName: "classJoinRequests_studentId_profiles_id"
	}),
	classJoinRequests_decidedBy: many(classJoinRequests, {
		relationName: "classJoinRequests_decidedBy_profiles_id"
	}),
}));

export const usersInAuthRelations = relations(usersInAuth, ({many}) => ({
	profiles: many(profiles),
}));

export const classEnrollmentsRelations = relations(classEnrollments, ({one}) => ({
	class: one(classes, {
		fields: [classEnrollments.classId],
		references: [classes.id]
	}),
	profile: one(profiles, {
		fields: [classEnrollments.studentId],
		references: [profiles.id]
	}),
}));

export const classesRelations = relations(classes, ({one, many}) => ({
	classEnrollments: many(classEnrollments),
	profile: one(profiles, {
		fields: [classes.teacherId],
		references: [profiles.id]
	}),
	classJoinRequests: many(classJoinRequests),
}));

export const classJoinRequestsRelations = relations(classJoinRequests, ({one}) => ({
	class: one(classes, {
		fields: [classJoinRequests.classId],
		references: [classes.id]
	}),
	profile_studentId: one(profiles, {
		fields: [classJoinRequests.studentId],
		references: [profiles.id],
		relationName: "classJoinRequests_studentId_profiles_id"
	}),
	profile_decidedBy: one(profiles, {
		fields: [classJoinRequests.decidedBy],
		references: [profiles.id],
		relationName: "classJoinRequests_decidedBy_profiles_id"
	}),
}));