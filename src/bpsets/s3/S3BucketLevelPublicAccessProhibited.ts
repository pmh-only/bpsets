import {
  S3Client,
  ListBucketsCommand,
  GetPublicAccessBlockCommand,
  PutPublicAccessBlockCommand
} from '@aws-sdk/client-s3'
import { BPSet, BPSetMetadata, BPSetStats } from '../../types'
import { Memorizer } from '../../Memorizer'

export class S3BucketLevelPublicAccessProhibited implements BPSet {
  private readonly client = new S3Client({})
  private readonly memoClient = Memorizer.memo(this.client)

  private readonly stats: BPSetStats = {
    compliantResources: [],
    nonCompliantResources: [],
    status: 'LOADED',
    errorMessage: []
  }

  public readonly getMetadata = (): BPSetMetadata => ({
    name: 'S3BucketLevelPublicAccessProhibited',
    description: 'Ensures that S3 buckets have public access blocked at the bucket level.',
    priority: 1,
    priorityReason: 'Blocking public access at the bucket level ensures security and prevents unauthorized access.',
    awsService: 'S3',
    awsServiceCategory: 'Buckets',
    bestPracticeCategory: 'Security',
    requiredParametersForFix: [],
    isFixFunctionUsesDestructiveCommand: false,
    commandUsedInCheckFunction: [
      {
        name: 'GetPublicAccessBlockCommand',
        reason: 'Retrieves the public access block configuration for the bucket.'
      }
    ],
    commandUsedInFixFunction: [
      {
        name: 'PutPublicAccessBlockCommand',
        reason: 'Enforces public access block configuration at the bucket level.'
      }
    ],
    adviseBeforeFixFunction: 'Ensure no legitimate use cases require public access before applying this fix.'
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
        const response = await this.memoClient.send(new GetPublicAccessBlockCommand({ Bucket: bucket.Name! }))
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
      } catch {
        nonCompliantResources.push(`arn:aws:s3:::${bucket.Name!}`)
      }
    }

    this.stats.compliantResources = compliantResources
    this.stats.nonCompliantResources = nonCompliantResources
  }

  public readonly fix = async (nonCompliantResources: string[]) => {
    this.stats.status = 'CHECKING'

    await this.fixImpl(nonCompliantResources)
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

  private readonly fixImpl = async (nonCompliantResources: string[]) => {
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

  private readonly getBuckets = async () => {
    const response = await this.memoClient.send(new ListBucketsCommand({}))
    return response.Buckets || []
  }
}
