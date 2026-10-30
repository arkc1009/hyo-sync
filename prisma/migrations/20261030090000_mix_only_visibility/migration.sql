-- CreateEnum
CREATE TYPE "SubmissionVisibility" AS ENUM ('TEAM', 'OWN_ONLY');

-- AlterEnum
ALTER TYPE "SubmissionStatus" ADD VALUE 'MIX_ONLY';

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "visibility" "SubmissionVisibility" NOT NULL DEFAULT 'TEAM';

-- AlterTable
ALTER TABLE "Submission" ALTER COLUMN "pitch" DROP NOT NULL;

