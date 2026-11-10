-- AlterTable
ALTER TABLE "Submission" ADD COLUMN     "syncOffsetMs" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "syncAutoMs" INTEGER,
ADD COLUMN     "syncConfidence" DOUBLE PRECISION;
