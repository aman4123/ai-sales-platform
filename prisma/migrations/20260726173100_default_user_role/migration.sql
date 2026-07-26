-- Keep legacy MEMBER accounts valid while assigning the V2 USER role to new registrations.
ALTER TABLE "User" ALTER COLUMN "role" SET DEFAULT 'USER';
