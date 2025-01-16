import {
  S3Client,
  ListBucketsCommand,
  GetBucketLifecycleConfigurationCommand,
  PutBucketLifecycleConfigurationCommand
} from '@aws-sdk/client-s3'
import { BPSet, BPSetMetadata, BPSetStats } from '../../types'
import { Memorizer } from '../../Memorizer'

export class S3LifecyclePolicyCheck implements BPSet {
  private readonly client = new S3Client({})
  private readonly memoClient = Memorizer.memo(this.client)

  private readonly stats: BPSetStats = {
    compliantResources: [],
    nonCompliantResources: [],
    status: 'LOADED',
    errorMessage: []
  }

  public readonly getMetadata = (): BPSetMetadata => ({
    name: 'S3LifecyclePolicyCheck',
    description: 'Ensures that all S3 buckets have lifecycle policies configured.',
    priority: 2,
    priorityReason: 'Lifecycle policies help manage storage costs by automatically transitioning or expiring objects.',
    awsService: 'S3',
    awsServiceCategory: 'Buckets',
    bestPracticeCategory: 'Cost Management',
    requiredParametersForFix: [
      {
        name: 'lifecycle-policy-rule-id',
        description: 'The ID of the lifecycle policy rule.',
        default: '',
        example: 'expire-old-objects'
      },
      {
        name: 'expiration-days',
        description: 'Number of days after which objects should expire.',
        default: '30',
        example: '30'
      }
    ],
    isFixFunctionUsesDestructiveCommand: false,
    commandUsedInCheckFunction: [
      {
        name: 'GetBucketLifecycleConfigurationCommand',
        reason: 'To determine if the bucket has a lifecycle policy configured.'
      }
    ],
    commandUsedInFixFunction: [
      {
        name: 'PutBucketLifecycleConfigurationCommand',
        reason: 'To configure a lifecycle policy for the bucket.'
      }
    ],
    adviseBeforeFixFunction:
      'Ensure that the lifecycle policy settings align with organizational storage management policies.'
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
      try {
        await this.memoClient.send(new GetBucketLifecycleConfigurationCommand({ Bucket: bucket.Name! }))
        compliantResources.push(`arn:aws:s3:::${bucket.Name!}`)
      } catch (error) {
        if ((error as unknown).name === 'NoSuchLifecycleConfiguration') {
          nonCompliantResources.push(`arn:aws:s3:::${bucket.Name!}`)
        } else {
          throw error
        }
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
    const ruleId = requiredParametersForFix.find((param) => param.name === 'lifecycle-policy-rule-id')?.value
    const expirationDays = requiredParametersForFix.find((param) => param.name === 'expiration-days')?.value

    if (!ruleId || !expirationDays) {
      throw new Error("Required parameters 'lifecycle-policy-rule-id' and/or 'expiration-days' are missing.")
    }

    for (const bucketArn of nonCompliantResources) {
      const bucketName = bucketArn.split(':::')[1]!
      await this.client.send(
        new PutBucketLifecycleConfigurationCommand({
          Bucket: bucketName,
          LifecycleConfiguration: {
            Rules: [
              {
                ID: ruleId,
                Status: 'Enabled',
                Expiration: {
                  Days: parseInt(expirationDays, 10)
                }
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
