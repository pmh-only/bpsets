import {
  S3Client,
  ListBucketsCommand,
  GetBucketVersioningCommand,
  PutBucketVersioningCommand
} from '@aws-sdk/client-s3'
import { BPSet } from '../BPSet'
import { Memorizer } from '../../Memorizer'

export class S3BucketVersioningEnabled implements BPSet {
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
      const response = await this.memoClient.send(
        new GetBucketVersioningCommand({ Bucket: bucket.Name! })
      )
      if (response.Status === 'Enabled') {
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

  public readonly fix = async (
    nonCompliantResources: string[],
    requiredParametersForFix: { name: string; value: string }[]
  ): Promise<void> => {
    for (const bucketArn of nonCompliantResources) {
      const bucketName = bucketArn.split(':::')[1]!
      await this.client.send(
        new PutBucketVersioningCommand({
          Bucket: bucketName,
          VersioningConfiguration: {
            Status: 'Enabled'
          }
        })
      )
    }
  }
}
