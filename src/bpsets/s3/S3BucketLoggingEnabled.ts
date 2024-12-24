import {
  S3Client,
  ListBucketsCommand,
  GetBucketLoggingCommand,
  PutBucketLoggingCommand
} from '@aws-sdk/client-s3'
import { BPSet } from '../../types'
import { Memorizer } from '../../Memorizer'

export class S3BucketLoggingEnabled implements BPSet {
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
        new GetBucketLoggingCommand({ Bucket: bucket.Name! })
      )
      if (response.LoggingEnabled) {
        compliantResources.push(`arn:aws:s3:::${bucket.Name!}`)
      } else {
        nonCompliantResources.push(`arn:aws:s3:::${bucket.Name!}`)
      }
    }

    return {
      compliantResources,
      nonCompliantResources,
      requiredParametersForFix: [{ name: 'log-destination-bucket' }]
    }
  }

  public readonly fix = async (
    nonCompliantResources: string[],
    requiredParametersForFix: { name: string; value: string }[]
  ): Promise<void> => {
    const logDestinationBucket = requiredParametersForFix.find(
      param => param.name === 'log-destination-bucket'
    )?.value

    if (!logDestinationBucket) {
      throw new Error("Required parameter 'log-destination-bucket' is missing.")
    }

    for (const bucketArn of nonCompliantResources) {
      const bucketName = bucketArn.split(':::')[1]!
      await this.client.send(
        new PutBucketLoggingCommand({
          Bucket: bucketName,
          BucketLoggingStatus: {
            LoggingEnabled: {
              TargetBucket: logDestinationBucket,
              TargetPrefix: `${bucketName}/logs/`
            }
          }
        })
      )
    }
  }
}
