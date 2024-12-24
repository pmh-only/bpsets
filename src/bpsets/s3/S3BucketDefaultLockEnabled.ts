import {
  S3Client,
  ListBucketsCommand,
  GetObjectLockConfigurationCommand,
  PutObjectLockConfigurationCommand
} from '@aws-sdk/client-s3'
import { BPSet } from '../../types'
import { Memorizer } from '../../Memorizer'

export class S3BucketDefaultLockEnabled implements BPSet {
  private readonly client = new S3Client({})
  private readonly memoClient = Memorizer.memo(this.client)

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
      try {
        await this.memoClient.send(
          new GetObjectLockConfigurationCommand({ Bucket: bucket.Name! })
        )
        compliantResources.push(`arn:aws:s3:::${bucket.Name!}`)
      } catch (error) {
        if ((error as any).name === 'ObjectLockConfigurationNotFoundError') {
          nonCompliantResources.push(`arn:aws:s3:::${bucket.Name!}`)
        } else {
          throw error
        }
      }
    }

    return {
      compliantResources,
      nonCompliantResources,
      requiredParametersForFix: []
    }
  }

  public readonly fix = async (
    nonCompliantResources: string[],
    requiredParametersForFix: { name: string; value: string }[]
  ): Promise<void> => {
    for (const bucketArn of nonCompliantResources) {
      const bucketName = bucketArn.split(':::')[1]!
      await this.client.send(
        new PutObjectLockConfigurationCommand({
          Bucket: bucketName,
          ObjectLockConfiguration: {
            ObjectLockEnabled: 'Enabled',
            Rule: {
              DefaultRetention: {
                Mode: 'GOVERNANCE',
                Days: 365
              }
            }
          }
        })
      )
    }
  }
}
