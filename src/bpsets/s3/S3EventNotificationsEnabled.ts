import {
  S3Client,
  ListBucketsCommand,
  GetBucketNotificationConfigurationCommand,
  PutBucketNotificationConfigurationCommand
} from '@aws-sdk/client-s3'
import { BPSet, BPSetMetadata, BPSetStats } from '../../types'
import { Memorizer } from '../../Memorizer'

export class S3EventNotificationsEnabled implements BPSet {
  private readonly client = new S3Client({})
  private readonly memoClient = Memorizer.memo(this.client)

  private readonly stats: BPSetStats = {
    compliantResources: [],
    nonCompliantResources: [],
    status: 'LOADED',
    errorMessage: []
  }

  public readonly getMetadata = (): BPSetMetadata => ({
    name: 'S3EventNotificationsEnabled',
    description: 'Ensures that S3 buckets have event notifications configured.',
    priority: 2,
    priorityReason:
      'Event notifications facilitate automated responses to S3 events, enhancing automation and security.',
    awsService: 'S3',
    awsServiceCategory: 'Buckets',
    bestPracticeCategory: 'Monitoring & Automation',
    requiredParametersForFix: [
      {
        name: 'lambda-function-arn',
        description: 'ARN of the Lambda function to invoke for bucket events.',
        default: '',
        example: 'arn:aws:lambda:us-east-1:123456789012:function:example-function'
      },
      {
        name: 'event-type',
        description: 'S3 event type to trigger the notification.',
        default: 's3:ObjectCreated:*',
        example: 's3:ObjectCreated:Put'
      }
    ],
    isFixFunctionUsesDestructiveCommand: false,
    commandUsedInCheckFunction: [
      {
        name: 'GetBucketNotificationConfigurationCommand',
        reason: 'Retrieve the current notification configuration for a bucket.'
      }
    ],
    commandUsedInFixFunction: [
      {
        name: 'PutBucketNotificationConfigurationCommand',
        reason: 'Add or update event notifications for the bucket.'
      }
    ],
    adviseBeforeFixFunction: 'Ensure the Lambda function has necessary permissions to handle the S3 events.'
  })

  public readonly getStats = () => this.stats

  public readonly clearStats = () => {
    this.stats.compliantResources = []
    this.stats.nonCompliantResources = []
    this.stats.status = 'LOADED'
    this.stats.errorMessage = []
  }

  public readonly check = async () => {
    this.stats.status = 'CHECKING'

    await this.checkImpl()
      .then(() => {
        this.stats.status = 'FINISHED'
      })
      .catch((err) => {
        this.stats.status = 'ERROR'
        this.stats.errorMessage.push({
          date: new Date(),
          message: err.message
        })
      })
  }

  private readonly checkImpl = async () => {
    const compliantResources: string[] = []
    const nonCompliantResources: string[] = []
    const buckets = await this.getBuckets()

    for (const bucket of buckets) {
      const response = await this.memoClient.send(
        new GetBucketNotificationConfigurationCommand({ Bucket: bucket.Name! })
      )
      if (response.LambdaFunctionConfigurations || response.QueueConfigurations || response.TopicConfigurations) {
        compliantResources.push(`arn:aws:s3:::${bucket.Name!}`)
      } else {
        nonCompliantResources.push(`arn:aws:s3:::${bucket.Name!}`)
      }
    }

    this.stats.compliantResources = compliantResources
    this.stats.nonCompliantResources = nonCompliantResources
  }

  public readonly fix = async (
    nonCompliantResources: string[],
    requiredParametersForFix: { name: string; value: string }[]
  ) => {
    this.stats.status = 'CHECKING'

    await this.fixImpl(nonCompliantResources, requiredParametersForFix)
      .then(() => {
        this.stats.status = 'FINISHED'
      })
      .catch((err) => {
        this.stats.status = 'ERROR'
        this.stats.errorMessage.push({
          date: new Date(),
          message: err.message
        })
      })
  }

  private readonly fixImpl = async (
    nonCompliantResources: string[],
    requiredParametersForFix: { name: string; value: string }[]
  ) => {
    const lambdaArn = requiredParametersForFix.find((param) => param.name === 'lambda-function-arn')?.value
    const eventType = requiredParametersForFix.find((param) => param.name === 'event-type')?.value

    if (!lambdaArn || !eventType) {
      throw new Error("Required parameters 'lambda-function-arn' and/or 'event-type' are missing.")
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
                Events: [eventType as unknown]
              }
            ]
          }
        })
      )
    }
  }

  private readonly getBuckets = async () => {
    const response = await this.memoClient.send(new ListBucketsCommand({}))
    return response.Buckets || []
  }
}
