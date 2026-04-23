-- CreateEnum
CREATE TYPE "VisitorStatus" AS ENUM ('NEW', 'ENRICHING', 'ENRICHED', 'SCORING', 'QUALIFIED', 'DISQUALIFIED', 'SYNCED_TO_SF', 'ERROR');

-- CreateTable
CREATE TABLE "Visitor" (
    "id" TEXT NOT NULL,
    "email" TEXT,
    "firstName" TEXT,
    "lastName" TEXT,
    "title" TEXT,
    "companyName" TEXT,
    "linkedinUrl" TEXT,
    "website" TEXT,
    "industry" TEXT,
    "employeeCount" TEXT,
    "estimatedRevenue" TEXT,
    "city" TEXT,
    "state" TEXT,
    "zipcode" TEXT,
    "profileType" TEXT NOT NULL DEFAULT 'Person',
    "tags" JSONB NOT NULL DEFAULT '[]',
    "filterMatches" JSONB NOT NULL DEFAULT '[]',
    "allTimePageViews" INTEGER NOT NULL DEFAULT 1,
    "isNewProfile" BOOLEAN NOT NULL DEFAULT true,
    "firstSeenAt" TIMESTAMP(3),
    "lastSeenAt" TIMESTAMP(3),
    "status" "VisitorStatus" NOT NULL DEFAULT 'NEW',
    "source" TEXT NOT NULL DEFAULT 'webhook',
    "rawPayload" JSONB,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Visitor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PageVisit" (
    "id" TEXT NOT NULL,
    "visitorId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "referrer" TEXT,
    "seenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PageVisit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EnrichmentResult" (
    "id" TEXT NOT NULL,
    "visitorId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "profileData" JSONB NOT NULL,
    "companyData" JSONB,
    "enrichedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EnrichmentResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IcpScore" (
    "id" TEXT NOT NULL,
    "visitorId" TEXT NOT NULL,
    "totalScore" DOUBLE PRECISION NOT NULL,
    "isQualified" BOOLEAN NOT NULL,
    "tier" TEXT NOT NULL,
    "disqualifyReason" TEXT,
    "scoreBreakdown" JSONB NOT NULL,
    "scoredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IcpScore_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SfSyncLog" (
    "id" TEXT NOT NULL,
    "visitorId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "sfObjectId" TEXT,
    "status" TEXT NOT NULL,
    "errorMsg" TEXT,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SfSyncLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutreachMessage" (
    "id" TEXT NOT NULL,
    "visitorId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "sentVia" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OutreachMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppSetting" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IcpConfig" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'default',
    "scoreThreshold" DOUBLE PRECISION NOT NULL DEFAULT 60,
    "rules" JSONB NOT NULL,
    "disqualifiers" JSONB NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IcpConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Visitor_email_idx" ON "Visitor"("email");

-- CreateIndex
CREATE INDEX "Visitor_status_idx" ON "Visitor"("status");

-- CreateIndex
CREATE INDEX "Visitor_createdAt_idx" ON "Visitor"("createdAt");

-- CreateIndex
CREATE INDEX "Visitor_profileType_idx" ON "Visitor"("profileType");

-- CreateIndex
CREATE INDEX "PageVisit_visitorId_idx" ON "PageVisit"("visitorId");

-- CreateIndex
CREATE UNIQUE INDEX "EnrichmentResult_visitorId_key" ON "EnrichmentResult"("visitorId");

-- CreateIndex
CREATE UNIQUE INDEX "IcpScore_visitorId_key" ON "IcpScore"("visitorId");

-- CreateIndex
CREATE INDEX "SfSyncLog_visitorId_idx" ON "SfSyncLog"("visitorId");

-- CreateIndex
CREATE INDEX "OutreachMessage_visitorId_idx" ON "OutreachMessage"("visitorId");

-- CreateIndex
CREATE UNIQUE INDEX "AppSetting_key_key" ON "AppSetting"("key");

-- AddForeignKey
ALTER TABLE "PageVisit" ADD CONSTRAINT "PageVisit_visitorId_fkey" FOREIGN KEY ("visitorId") REFERENCES "Visitor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EnrichmentResult" ADD CONSTRAINT "EnrichmentResult_visitorId_fkey" FOREIGN KEY ("visitorId") REFERENCES "Visitor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IcpScore" ADD CONSTRAINT "IcpScore_visitorId_fkey" FOREIGN KEY ("visitorId") REFERENCES "Visitor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SfSyncLog" ADD CONSTRAINT "SfSyncLog_visitorId_fkey" FOREIGN KEY ("visitorId") REFERENCES "Visitor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutreachMessage" ADD CONSTRAINT "OutreachMessage_visitorId_fkey" FOREIGN KEY ("visitorId") REFERENCES "Visitor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
