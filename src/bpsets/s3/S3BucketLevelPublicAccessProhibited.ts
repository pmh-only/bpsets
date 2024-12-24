import {
  S3Client,
  ListBucketsCommand,
  GetPublicAccessBlockCommand,
  PutPublicAccessBlockCommand
} from '@aws-sdk/client-s3'
import { BPSet } from '../../types'
import { Memorizer } from '../../Memorizer'

export class S3BucketLevelPublicAccessProhibited implements BPSet {
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
        const response = await this.memoClient.send(
          new GetPublicAccessBlockCommand({ Bucket: bucket.Name! })
        )
        const config = response.PublicAccessBlockConfiguration
        if (
          config?.BlockPublicAcls &&
          config?.IgnorePublicAcls &&
          config?.BlockPublicPolicy &&
          config?.RestrictPublicBuckets
        ) {
          compliantResources.push(`arn:aws:s3:::${bucket.Name!}`)
        } else {
          nonCompliantResources.push(`arn:aws:s3:::${bucket.Name!}`)
        }
      } catch (error) {
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
        new PutPublicAccessBlockCommand({
          Bucket: bucketName,
          PublicAccessBlockConfiguration: {
            BlockPublicAcls: true,
            IgnorePublicAcls: true,
            BlockPublicPolicy: true,
            RestrictPublicBuckets: true
          }
        })
      )
    }
  }
}
