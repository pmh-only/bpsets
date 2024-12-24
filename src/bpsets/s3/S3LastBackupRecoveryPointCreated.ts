import {
  S3Client,
  ListBucketsCommand
} from '@aws-sdk/client-s3'
import { BackupClient, ListRecoveryPointsByResourceCommand } from '@aws-sdk/client-backup'
import { BPSet } from '../../types'
import { Memorizer } from '../../Memorizer'

export class S3LastBackupRecoveryPointCreated implements BPSet {
  private readonly client = new S3Client({})
  private readonly memoClient = Memorizer.memo(this.client)
  private readonly backupClient = Memorizer.memo(new BackupClient({}))

  private readonly getBuckets = async () => {
    const response = await this.memoClient.send(new ListBucketsCommand({}))
    return response.Buckets || []
  }

  public readonly check = async (): Promise<{
    compliantResources: string[]
    nonCompliantResources: string[]
    requiredParametersForFix: { name: string }[]
  }> => {
    const compliantResources: string[] = []
    const nonCompliantResources: string[] = []
    const buckets = await this.getBuckets()

    for (const bucket of buckets) {
      const recoveryPoints = await this.memoClient.send(
        new ListRecoveryPointsByResourceCommand({
          ResourceArn: `arn:aws:s3:::${bucket.Name!}`
        })
      )

      if (recoveryPoints.RecoveryPoints && recoveryPoints.RecoveryPoints.length > 0) {
        compliantResources.push(`arn:aws:s3:::${bucket.Name!}`)
      } else {
        nonCompliantResources.push(`arn:aws:s3:::${bucket.Name!}`)
      }
    }

    return {
      compliantResources,
      nonCompliantResources,
      requiredParametersForFix: []
    }
  }

  public readonly fix = async (): Promise<void> => {
    throw new Error('Fixing recovery points requires custom implementation for backup setup.')
  }
}
