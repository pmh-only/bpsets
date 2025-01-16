import {
  S3Client,
  ListBucketsCommand,
  GetBucketVersioningCommand,
  PutBucketVersioningCommand
} from '@aws-sdk/client-s3'
import { BPSet, BPSetMetadata, BPSetStats } from '../../types'
import { Memorizer } from '../../Memorizer'

export class S3BucketVersioningEnabled implements BPSet {
  private readonly client = new S3Client({})
  private readonly memoClient = Memorizer.memo(this.client)

  private readonly stats: BPSetStats = {
    compliantResources: [],
    nonCompliantResources: [],
    status: 'LOADED',
    errorMessage: []
  }

  public readonly getMetadata = (): BPSetMetadata => ({
    name: 'S3BucketVersioningEnabled',
    description: 'Ensures that versioning is enabled on all S3 buckets.',
    priority: 1,
    priorityReason:
      'Enabling versioning protects against accidental data loss and allows recovery of previous versions.',
    awsService: 'S3',
    awsServiceCategory: 'Buckets',
    bestPracticeCategory: 'Data Protection',
    requiredParametersForFix: [],
    isFixFunctionUsesDestructiveCommand: false,
    commandUsedInCheckFunction: [
      {
        name: 'GetBucketVersioningCommand',
        reason: 'Retrieve the current versioning status of the bucket.'
      }
    ],
    commandUsedInFixFunction: [
      {
        name: 'PutBucketVersioningCommand',
        reason: 'Enable versioning on the bucket.'
      }
    ],
    adviseBeforeFixFunction: 'Ensure that enabling versioning aligns with your data lifecycle and cost considerations.'
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
      const response = await this.memoClient.send(new GetBucketVersioningCommand({ Bucket: bucket.Name! }))
      if (response.Status === 'Enabled') {
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

  private readonly fixImpl = async (nonCompliantResources: string[]) => {
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

  private readonly getBuckets = async () => {
    const response = await this.memoClient.send(new ListBucketsCommand({}))
    return response.Buckets || []
  }
}
