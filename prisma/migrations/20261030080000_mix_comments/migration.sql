-- CreateTable
CREATE TABLE "Instrumental" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "blobUrl" TEXT NOT NULL,
    "durationMs" INTEGER NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Instrumental_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrackComment" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "startMs" INTEGER NOT NULL,
    "endMs" INTEGER NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrackComment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Instrumental_projectId_createdAt_idx" ON "Instrumental"("projectId", "createdAt");

-- CreateIndex
CREATE INDEX "TrackComment_submissionId_startMs_idx" ON "TrackComment"("submissionId", "startMs");

-- AddForeignKey
ALTER TABLE "Instrumental" ADD CONSTRAINT "Instrumental_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Instrumental" ADD CONSTRAINT "Instrumental_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrackComment" ADD CONSTRAINT "TrackComment_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "Submission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrackComment" ADD CONSTRAINT "TrackComment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

