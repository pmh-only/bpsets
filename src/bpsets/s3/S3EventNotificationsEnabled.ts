import {
  S3Client,
  ListBucketsCommand,
  GetBucketNotificationConfigurationCommand,
  PutBucketNotificationConfigurationCommand
} from '@aws-sdk/client-s3'
import { BPSet } from '../BPSet'
import { Memorizer } from '../../Memorizer'

export class S3EventNotificationsEnabled implements BPSet {
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
        new GetBucketNotificationConfigurationCommand({ Bucket: bucket.Name! })
      )
      if (
        response.LambdaFunctionConfigurations ||
        response.QueueConfigurations ||
        response.TopicConfigurations
      ) {
        compliantResources.push(`arn:aws:s3:::${bucket.Name!}`)
      } else {
        nonCompliantResources.push(`arn:aws:s3:::${bucket.Name!}`)
      }
    }

    return {
      compliantResources,
      nonCompliantResources,
      requiredParametersForFix: [
        { name: 'lambda-function-arn' },
        { name: 'event-type' }
      ]
    }
  }

  public readonly fix = async (
    nonCompliantResources: string[],
    requiredParametersForFix: { name: string; value: string }[]
  ): Promise<void> => {
    const lambdaArn = requiredParametersForFix.find(
      param => param.name === 'lambda-function-arn'
    )?.value
    const eventType = requiredParametersForFix.find(
      param => param.name === 'event-type'
    )?.value

    if (!lambdaArn || !eventType) {
      throw new Error(
        "Required parameters 'lambda-function-arn' and/or 'event-type' are missing."
      )
    }

    for (const bucketArn of nonCompliantResources) {
      const bucketName = bucketArn.split(':::')[1]!
      await this.client.send(
        new PutBucketNotificationConfigurationCommand({
          Bucket: bucketName,
          NotificationConfiguration: {
            LambdaFunctionConfigurations: [
              {
                LambdaFunctionArn: lambdaArn,
                Events: [eventType as any]
              }
            ]
          }
        })
      )
    }
  }
}
