-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('USER', 'MANAGER', 'ADMIN');

-- CreateEnum
CREATE TYPE "SuggestionStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ToiletStatus" AS ENUM ('OPEN', 'CLOSED', 'UNDER_MAINTENANCE');

-- CreateEnum
CREATE TYPE "AccessType" AS ENUM ('FREE', 'PAID', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'RESOLVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ReportCategory" AS ENUM ('DIRTY', 'NO_WATER', 'NO_SOAP', 'BROKEN_DOOR', 'BROKEN_EQUIPMENT', 'INCORRECT_LOCATION', 'INCORRECT_PRICE', 'CLOSED', 'OTHER');

-- CreateEnum
CREATE TYPE "Language" AS ENUM ('EN', 'KM');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('SUGGESTION_SUBMITTED', 'SUGGESTION_APPROVED', 'SUGGESTION_REJECTED', 'REPORT_CREATED', 'REPORT_STATUS_CHANGED', 'REVIEW_MODERATED', 'ROLE_CHANGED', 'MANAGER_ASSIGNED', 'SYSTEM');

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "email" VARCHAR(254) NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "fullName" VARCHAR(120) NOT NULL,
    "phone" VARCHAR(32),
    "avatarPath" TEXT,
    "preferredLanguage" "Language" NOT NULL DEFAULT 'EN',
    "role" "UserRole" NOT NULL DEFAULT 'USER',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "tokenVersion" INTEGER NOT NULL DEFAULT 0,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefreshToken" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "familyId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "replacedById" UUID,
    "userAgent" VARCHAR(255),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PasswordResetToken" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Toilet" (
    "id" UUID NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "nameKm" VARCHAR(150),
    "description" VARCHAR(2000),
    "descriptionKm" VARCHAR(2000),
    "address" VARCHAR(300) NOT NULL,
    "province" VARCHAR(80) NOT NULL DEFAULT 'Phnom Penh',
    "district" VARCHAR(80),
    "sangkat" VARCHAR(80),
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "accessType" "AccessType" NOT NULL DEFAULT 'UNKNOWN',
    "priceKhr" INTEGER,
    "status" "ToiletStatus" NOT NULL DEFAULT 'OPEN',
    "notes" VARCHAR(1000),
    "averageRating" DOUBLE PRECISION,
    "cleanlinessRating" DOUBLE PRECISION,
    "reviewCount" INTEGER NOT NULL DEFAULT 0,
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "verifiedAt" TIMESTAMP(3),
    "lastVerifiedAt" TIMESTAMP(3),
    "verifiedById" UUID,
    "archivedAt" TIMESTAMP(3),
    "archivedById" UUID,
    "archiveReason" VARCHAR(500),
    "coverImageId" UUID,
    "createdById" UUID,
    "isSampleData" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Toilet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Facility" (
    "id" UUID NOT NULL,
    "toiletId" UUID NOT NULL,
    "hasWater" BOOLEAN,
    "hasSoap" BOOLEAN,
    "wheelchairAccessible" BOOLEAN,
    "babyChanging" BOOLEAN,
    "hasToiletPaper" BOOLEAN,
    "hasHandDryer" BOOLEAN,
    "isGenderNeutral" BOOLEAN,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Facility_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OpeningHour" (
    "id" UUID NOT NULL,
    "toiletId" UUID NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "openMinute" INTEGER NOT NULL,
    "closeMinute" INTEGER NOT NULL,

    CONSTRAINT "OpeningHour_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ToiletImage" (
    "id" UUID NOT NULL,
    "toiletId" UUID NOT NULL,
    "bucket" VARCHAR(63) NOT NULL,
    "objectPath" VARCHAR(512) NOT NULL,
    "mimeType" VARCHAR(50) NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "sha256" CHAR(64),
    "caption" VARCHAR(300),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "uploadedById" UUID,
    "sourceSuggestionImageId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ToiletImage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ToiletSuggestion" (
    "id" UUID NOT NULL,
    "contributorId" UUID NOT NULL,
    "status" "SuggestionStatus" NOT NULL DEFAULT 'PENDING',
    "name" VARCHAR(150) NOT NULL,
    "nameKm" VARCHAR(150),
    "description" VARCHAR(2000),
    "address" VARCHAR(300) NOT NULL,
    "province" VARCHAR(80) NOT NULL DEFAULT 'Phnom Penh',
    "district" VARCHAR(80),
    "sangkat" VARCHAR(80),
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "accessType" "AccessType" NOT NULL DEFAULT 'UNKNOWN',
    "priceKhr" INTEGER,
    "hasWater" BOOLEAN,
    "hasSoap" BOOLEAN,
    "wheelchairAccessible" BOOLEAN,
    "babyChanging" BOOLEAN,
    "hasToiletPaper" BOOLEAN,
    "openingHours" JSONB,
    "notes" VARCHAR(1000),
    "hasPotentialDuplicate" BOOLEAN NOT NULL DEFAULT false,
    "duplicateCandidates" JSONB,
    "reviewedById" UUID,
    "reviewedAt" TIMESTAMP(3),
    "rejectionReason" VARCHAR(1000),
    "reviewNote" VARCHAR(1000),
    "reviewCorrections" JSONB,
    "publishedToiletId" UUID,
    "resubmittedFromId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ToiletSuggestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SuggestionImage" (
    "id" UUID NOT NULL,
    "suggestionId" UUID,
    "uploaderId" UUID NOT NULL,
    "bucket" VARCHAR(63) NOT NULL,
    "objectPath" VARCHAR(512) NOT NULL,
    "mimeType" VARCHAR(50) NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "sha256" CHAR(64) NOT NULL,
    "isCover" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "attachedAt" TIMESTAMP(3),
    "removedAt" TIMESTAMP(3),
    "removedReason" VARCHAR(300),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SuggestionImage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Review" (
    "id" UUID NOT NULL,
    "toiletId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "rating" INTEGER NOT NULL,
    "cleanlinessRating" INTEGER NOT NULL,
    "comment" VARCHAR(2000),
    "isHidden" BOOLEAN NOT NULL DEFAULT false,
    "hiddenReason" VARCHAR(500),
    "moderatedById" UUID,
    "moderatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Review_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Report" (
    "id" UUID NOT NULL,
    "toiletId" UUID NOT NULL,
    "reporterId" UUID NOT NULL,
    "category" "ReportCategory" NOT NULL,
    "description" VARCHAR(2000) NOT NULL,
    "status" "ReportStatus" NOT NULL DEFAULT 'PENDING',
    "resolutionNote" VARCHAR(1000),
    "resolvedById" UUID,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Report_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReportImage" (
    "id" UUID NOT NULL,
    "reportId" UUID,
    "uploaderId" UUID NOT NULL,
    "bucket" VARCHAR(63) NOT NULL,
    "objectPath" VARCHAR(512) NOT NULL,
    "mimeType" VARCHAR(50) NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "sha256" CHAR(64) NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "attachedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReportImage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReportStatusHistory" (
    "id" UUID NOT NULL,
    "reportId" UUID NOT NULL,
    "fromStatus" "ReportStatus",
    "toStatus" "ReportStatus" NOT NULL,
    "note" VARCHAR(1000),
    "changedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReportStatusHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Favorite" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "toiletId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Favorite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ManagerAssignment" (
    "id" UUID NOT NULL,
    "managerId" UUID NOT NULL,
    "toiletId" UUID NOT NULL,
    "assignedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ManagerAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CleaningSchedule" (
    "id" UUID NOT NULL,
    "toiletId" UUID NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "startMinute" INTEGER NOT NULL,
    "notes" VARCHAR(500),
    "assignedTo" VARCHAR(120),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CleaningSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CleaningLog" (
    "id" UUID NOT NULL,
    "toiletId" UUID NOT NULL,
    "loggedById" UUID,
    "cleanedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" VARCHAR(1000),
    "waterRefilled" BOOLEAN,
    "soapRefilled" BOOLEAN,
    "paperRefilled" BOOLEAN,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CleaningLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "message" VARCHAR(1000) NOT NULL,
    "titleKm" VARCHAR(200),
    "messageKm" VARCHAR(1000),
    "data" JSONB,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" UUID NOT NULL,
    "actorId" UUID,
    "action" VARCHAR(80) NOT NULL,
    "entityType" VARCHAR(60) NOT NULL,
    "entityId" VARCHAR(64),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_role_idx" ON "User"("role");

-- CreateIndex
CREATE INDEX "User_createdAt_idx" ON "User"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "RefreshToken_tokenHash_key" ON "RefreshToken"("tokenHash");

-- CreateIndex
CREATE INDEX "RefreshToken_userId_idx" ON "RefreshToken"("userId");

-- CreateIndex
CREATE INDEX "RefreshToken_familyId_idx" ON "RefreshToken"("familyId");

-- CreateIndex
CREATE INDEX "RefreshToken_expiresAt_idx" ON "RefreshToken"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "PasswordResetToken_tokenHash_key" ON "PasswordResetToken"("tokenHash");

-- CreateIndex
CREATE INDEX "PasswordResetToken_userId_idx" ON "PasswordResetToken"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Toilet_coverImageId_key" ON "Toilet"("coverImageId");

-- CreateIndex
CREATE INDEX "Toilet_isVerified_archivedAt_idx" ON "Toilet"("isVerified", "archivedAt");

-- CreateIndex
CREATE INDEX "Toilet_latitude_longitude_idx" ON "Toilet"("latitude", "longitude");

-- CreateIndex
CREATE INDEX "Toilet_district_idx" ON "Toilet"("district");

-- CreateIndex
CREATE INDEX "Toilet_accessType_idx" ON "Toilet"("accessType");

-- CreateIndex
CREATE INDEX "Toilet_status_idx" ON "Toilet"("status");

-- CreateIndex
CREATE INDEX "Toilet_averageRating_idx" ON "Toilet"("averageRating");

-- CreateIndex
CREATE UNIQUE INDEX "Facility_toiletId_key" ON "Facility"("toiletId");

-- CreateIndex
CREATE INDEX "Facility_hasWater_idx" ON "Facility"("hasWater");

-- CreateIndex
CREATE INDEX "Facility_hasSoap_idx" ON "Facility"("hasSoap");

-- CreateIndex
CREATE INDEX "Facility_wheelchairAccessible_idx" ON "Facility"("wheelchairAccessible");

-- CreateIndex
CREATE INDEX "OpeningHour_toiletId_dayOfWeek_idx" ON "OpeningHour"("toiletId", "dayOfWeek");

-- CreateIndex
CREATE INDEX "OpeningHour_dayOfWeek_openMinute_closeMinute_idx" ON "OpeningHour"("dayOfWeek", "openMinute", "closeMinute");

-- CreateIndex
CREATE UNIQUE INDEX "ToiletImage_sourceSuggestionImageId_key" ON "ToiletImage"("sourceSuggestionImageId");

-- CreateIndex
CREATE INDEX "ToiletImage_toiletId_sortOrder_idx" ON "ToiletImage"("toiletId", "sortOrder");

-- CreateIndex
CREATE INDEX "ToiletImage_bucket_objectPath_idx" ON "ToiletImage"("bucket", "objectPath");

-- CreateIndex
CREATE UNIQUE INDEX "ToiletImage_toiletId_sha256_key" ON "ToiletImage"("toiletId", "sha256");

-- CreateIndex
CREATE UNIQUE INDEX "ToiletSuggestion_publishedToiletId_key" ON "ToiletSuggestion"("publishedToiletId");

-- CreateIndex
CREATE UNIQUE INDEX "ToiletSuggestion_resubmittedFromId_key" ON "ToiletSuggestion"("resubmittedFromId");

-- CreateIndex
CREATE INDEX "ToiletSuggestion_status_createdAt_idx" ON "ToiletSuggestion"("status", "createdAt");

-- CreateIndex
CREATE INDEX "ToiletSuggestion_contributorId_createdAt_idx" ON "ToiletSuggestion"("contributorId", "createdAt");

-- CreateIndex
CREATE INDEX "ToiletSuggestion_latitude_longitude_idx" ON "ToiletSuggestion"("latitude", "longitude");

-- CreateIndex
CREATE INDEX "SuggestionImage_uploaderId_suggestionId_idx" ON "SuggestionImage"("uploaderId", "suggestionId");

-- CreateIndex
CREATE INDEX "SuggestionImage_suggestionId_sortOrder_idx" ON "SuggestionImage"("suggestionId", "sortOrder");

-- CreateIndex
CREATE INDEX "SuggestionImage_bucket_objectPath_idx" ON "SuggestionImage"("bucket", "objectPath");

-- CreateIndex
CREATE INDEX "SuggestionImage_createdAt_idx" ON "SuggestionImage"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SuggestionImage_suggestionId_sha256_key" ON "SuggestionImage"("suggestionId", "sha256");

-- CreateIndex
CREATE INDEX "Review_toiletId_isHidden_createdAt_idx" ON "Review"("toiletId", "isHidden", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Review_userId_toiletId_key" ON "Review"("userId", "toiletId");

-- CreateIndex
CREATE INDEX "Report_toiletId_status_idx" ON "Report"("toiletId", "status");

-- CreateIndex
CREATE INDEX "Report_reporterId_createdAt_idx" ON "Report"("reporterId", "createdAt");

-- CreateIndex
CREATE INDEX "Report_status_createdAt_idx" ON "Report"("status", "createdAt");

-- CreateIndex
CREATE INDEX "ReportImage_uploaderId_reportId_idx" ON "ReportImage"("uploaderId", "reportId");

-- CreateIndex
CREATE INDEX "ReportImage_createdAt_idx" ON "ReportImage"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ReportImage_reportId_sha256_key" ON "ReportImage"("reportId", "sha256");

-- CreateIndex
CREATE INDEX "ReportStatusHistory_reportId_createdAt_idx" ON "ReportStatusHistory"("reportId", "createdAt");

-- CreateIndex
CREATE INDEX "Favorite_userId_createdAt_idx" ON "Favorite"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Favorite_userId_toiletId_key" ON "Favorite"("userId", "toiletId");

-- CreateIndex
CREATE INDEX "ManagerAssignment_toiletId_idx" ON "ManagerAssignment"("toiletId");

-- CreateIndex
CREATE UNIQUE INDEX "ManagerAssignment_managerId_toiletId_key" ON "ManagerAssignment"("managerId", "toiletId");

-- CreateIndex
CREATE INDEX "CleaningSchedule_toiletId_dayOfWeek_idx" ON "CleaningSchedule"("toiletId", "dayOfWeek");

-- CreateIndex
CREATE INDEX "CleaningLog_toiletId_cleanedAt_idx" ON "CleaningLog"("toiletId", "cleanedAt");

-- CreateIndex
CREATE INDEX "Notification_userId_readAt_createdAt_idx" ON "Notification"("userId", "readAt", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_actorId_createdAt_idx" ON "AuditLog"("actorId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_action_createdAt_idx" ON "AuditLog"("action", "createdAt");

-- AddForeignKey
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Toilet" ADD CONSTRAINT "Toilet_coverImageId_fkey" FOREIGN KEY ("coverImageId") REFERENCES "ToiletImage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Toilet" ADD CONSTRAINT "Toilet_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Toilet" ADD CONSTRAINT "Toilet_verifiedById_fkey" FOREIGN KEY ("verifiedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Toilet" ADD CONSTRAINT "Toilet_archivedById_fkey" FOREIGN KEY ("archivedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Facility" ADD CONSTRAINT "Facility_toiletId_fkey" FOREIGN KEY ("toiletId") REFERENCES "Toilet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpeningHour" ADD CONSTRAINT "OpeningHour_toiletId_fkey" FOREIGN KEY ("toiletId") REFERENCES "Toilet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ToiletImage" ADD CONSTRAINT "ToiletImage_toiletId_fkey" FOREIGN KEY ("toiletId") REFERENCES "Toilet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ToiletImage" ADD CONSTRAINT "ToiletImage_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ToiletImage" ADD CONSTRAINT "ToiletImage_sourceSuggestionImageId_fkey" FOREIGN KEY ("sourceSuggestionImageId") REFERENCES "SuggestionImage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ToiletSuggestion" ADD CONSTRAINT "ToiletSuggestion_contributorId_fkey" FOREIGN KEY ("contributorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ToiletSuggestion" ADD CONSTRAINT "ToiletSuggestion_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ToiletSuggestion" ADD CONSTRAINT "ToiletSuggestion_publishedToiletId_fkey" FOREIGN KEY ("publishedToiletId") REFERENCES "Toilet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ToiletSuggestion" ADD CONSTRAINT "ToiletSuggestion_resubmittedFromId_fkey" FOREIGN KEY ("resubmittedFromId") REFERENCES "ToiletSuggestion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SuggestionImage" ADD CONSTRAINT "SuggestionImage_suggestionId_fkey" FOREIGN KEY ("suggestionId") REFERENCES "ToiletSuggestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SuggestionImage" ADD CONSTRAINT "SuggestionImage_uploaderId_fkey" FOREIGN KEY ("uploaderId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_toiletId_fkey" FOREIGN KEY ("toiletId") REFERENCES "Toilet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_moderatedById_fkey" FOREIGN KEY ("moderatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_toiletId_fkey" FOREIGN KEY ("toiletId") REFERENCES "Toilet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportImage" ADD CONSTRAINT "ReportImage_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "Report"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportImage" ADD CONSTRAINT "ReportImage_uploaderId_fkey" FOREIGN KEY ("uploaderId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportStatusHistory" ADD CONSTRAINT "ReportStatusHistory_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "Report"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportStatusHistory" ADD CONSTRAINT "ReportStatusHistory_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Favorite" ADD CONSTRAINT "Favorite_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Favorite" ADD CONSTRAINT "Favorite_toiletId_fkey" FOREIGN KEY ("toiletId") REFERENCES "Toilet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManagerAssignment" ADD CONSTRAINT "ManagerAssignment_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManagerAssignment" ADD CONSTRAINT "ManagerAssignment_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManagerAssignment" ADD CONSTRAINT "ManagerAssignment_toiletId_fkey" FOREIGN KEY ("toiletId") REFERENCES "Toilet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CleaningSchedule" ADD CONSTRAINT "CleaningSchedule_toiletId_fkey" FOREIGN KEY ("toiletId") REFERENCES "Toilet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CleaningSchedule" ADD CONSTRAINT "CleaningSchedule_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CleaningLog" ADD CONSTRAINT "CleaningLog_toiletId_fkey" FOREIGN KEY ("toiletId") REFERENCES "Toilet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CleaningLog" ADD CONSTRAINT "CleaningLog_loggedById_fkey" FOREIGN KEY ("loggedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────────────────────────
-- Data-integrity CHECK constraints (not expressible in schema.prisma).
-- Prisma Migrate does not manage CHECK constraints, so later migrations keep them.
-- ─────────────────────────────────────────────────────────────────────────────

-- Coordinates
ALTER TABLE "Toilet" ADD CONSTRAINT "Toilet_latitude_check" CHECK ("latitude" BETWEEN -90 AND 90);
ALTER TABLE "Toilet" ADD CONSTRAINT "Toilet_longitude_check" CHECK ("longitude" BETWEEN -180 AND 180);
ALTER TABLE "ToiletSuggestion" ADD CONSTRAINT "ToiletSuggestion_latitude_check" CHECK ("latitude" BETWEEN -90 AND 90);
ALTER TABLE "ToiletSuggestion" ADD CONSTRAINT "ToiletSuggestion_longitude_check" CHECK ("longitude" BETWEEN -180 AND 180);

-- Nonnegative integer KHR prices; FREE toilets cost 0 (or unknown), UNKNOWN access has no price
ALTER TABLE "Toilet" ADD CONSTRAINT "Toilet_priceKhr_check" CHECK ("priceKhr" IS NULL OR "priceKhr" >= 0);
ALTER TABLE "Toilet" ADD CONSTRAINT "Toilet_free_price_check" CHECK ("accessType" <> 'FREE' OR "priceKhr" IS NULL OR "priceKhr" = 0);
ALTER TABLE "ToiletSuggestion" ADD CONSTRAINT "ToiletSuggestion_priceKhr_check" CHECK ("priceKhr" IS NULL OR "priceKhr" >= 0);
ALTER TABLE "ToiletSuggestion" ADD CONSTRAINT "ToiletSuggestion_free_price_check" CHECK ("accessType" <> 'FREE' OR "priceKhr" IS NULL OR "priceKhr" = 0);

-- Aggregates
ALTER TABLE "Toilet" ADD CONSTRAINT "Toilet_reviewCount_check" CHECK ("reviewCount" >= 0);
ALTER TABLE "Toilet" ADD CONSTRAINT "Toilet_averageRating_check" CHECK ("averageRating" IS NULL OR "averageRating" BETWEEN 1 AND 5);
ALTER TABLE "Toilet" ADD CONSTRAINT "Toilet_cleanlinessRating_check" CHECK ("cleanlinessRating" IS NULL OR "cleanlinessRating" BETWEEN 1 AND 5);

-- Verification / archive consistency
ALTER TABLE "Toilet" ADD CONSTRAINT "Toilet_verified_at_check" CHECK (NOT "isVerified" OR "verifiedAt" IS NOT NULL);

-- Suggestion review consistency
ALTER TABLE "ToiletSuggestion" ADD CONSTRAINT "ToiletSuggestion_approved_link_check"
  CHECK ("status" <> 'APPROVED' OR ("publishedToiletId" IS NOT NULL AND "reviewedAt" IS NOT NULL));
ALTER TABLE "ToiletSuggestion" ADD CONSTRAINT "ToiletSuggestion_rejected_reason_check"
  CHECK ("status" <> 'REJECTED' OR ("rejectionReason" IS NOT NULL AND length(btrim("rejectionReason")) > 0 AND "reviewedAt" IS NOT NULL));
ALTER TABLE "ToiletSuggestion" ADD CONSTRAINT "ToiletSuggestion_no_self_resubmission_check"
  CHECK ("resubmittedFromId" IS NULL OR "resubmittedFromId" <> "id");

-- Ratings are integers from 1 to 5
ALTER TABLE "Review" ADD CONSTRAINT "Review_rating_check" CHECK ("rating" BETWEEN 1 AND 5);
ALTER TABLE "Review" ADD CONSTRAINT "Review_cleanlinessRating_check" CHECK ("cleanlinessRating" BETWEEN 1 AND 5);

-- Opening hours (minutes from local midnight; closeMinute > 1440 means the interval ends next day)
ALTER TABLE "OpeningHour" ADD CONSTRAINT "OpeningHour_dayOfWeek_check" CHECK ("dayOfWeek" BETWEEN 0 AND 6);
ALTER TABLE "OpeningHour" ADD CONSTRAINT "OpeningHour_openMinute_check" CHECK ("openMinute" BETWEEN 0 AND 1439);
ALTER TABLE "OpeningHour" ADD CONSTRAINT "OpeningHour_closeMinute_check"
  CHECK ("closeMinute" > "openMinute" AND "closeMinute" <= "openMinute" + 1440);

-- Cleaning schedules
ALTER TABLE "CleaningSchedule" ADD CONSTRAINT "CleaningSchedule_dayOfWeek_check" CHECK ("dayOfWeek" BETWEEN 0 AND 6);
ALTER TABLE "CleaningSchedule" ADD CONSTRAINT "CleaningSchedule_startMinute_check" CHECK ("startMinute" BETWEEN 0 AND 1439);

-- Image metadata
ALTER TABLE "ToiletImage" ADD CONSTRAINT "ToiletImage_sizeBytes_check" CHECK ("sizeBytes" > 0);
ALTER TABLE "SuggestionImage" ADD CONSTRAINT "SuggestionImage_sizeBytes_check" CHECK ("sizeBytes" > 0);
ALTER TABLE "ReportImage" ADD CONSTRAINT "ReportImage_sizeBytes_check" CHECK ("sizeBytes" > 0);

-- At most one cover photo per suggestion (partial unique index)
CREATE UNIQUE INDEX "SuggestionImage_one_cover_per_suggestion" ON "SuggestionImage" ("suggestionId") WHERE "isCover" = true AND "suggestionId" IS NOT NULL;

