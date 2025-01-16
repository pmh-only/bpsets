import {
  CloudFrontClient,
  ListDistributionsCommand,
  GetDistributionCommand,
  UpdateDistributionCommand,
  DistributionConfig
} from '@aws-sdk/client-cloudfront'
import { BPSet, BPSetFixFn, BPSetStats } from '../../types'
import { Memorizer } from '../../Memorizer'

export class CloudFrontAccessLogsEnabled implements BPSet {
  private readonly client = new CloudFrontClient({})
  private readonly memoClient = Memorizer.memo(this.client)

  private readonly getDistributions = async () => {
    const response = await this.memoClient.send(new ListDistributionsCommand({}))
    return response.DistributionList?.Items || []
  }

  private readonly getDistributionDetails = async (distributionId: string) => {
    const response = await this.memoClient.send(new GetDistributionCommand({ Id: distributionId }))
    return {
      distribution: response.Distribution!,
      etag: response.ETag!
    }
  }

  public readonly getMetadata = () => ({
    name: 'CloudFrontAccessLogsEnabled',
    description: 'Ensures that access logging is enabled for CloudFront distributions.',
    priority: 1,
    priorityReason: 'Access logs are critical for monitoring and troubleshooting CloudFront distributions.',
    awsService: 'CloudFront',
    awsServiceCategory: 'CDN',
    bestPracticeCategory: 'Logging and Monitoring',
    requiredParametersForFix: [
      {
        name: 'log-bucket-name',
        description: 'The S3 bucket name for storing access logs.',
        default: '',
        example: 'my-cloudfront-logs-bucket.s3.amazonaws.com'
      }
    ],
    isFixFunctionUsesDestructiveCommand: false,
    commandUsedInCheckFunction: [
      {
        name: 'ListDistributionsCommand',
        reason: 'List all CloudFront distributions.'
      },
      {
        name: 'GetDistributionCommand',
        reason: 'Retrieve distribution details to check logging settings.'
      }
    ],
    commandUsedInFixFunction: [
      {
        name: 'UpdateDistributionCommand',
        reason: 'Enable logging and update distribution settings.'
      }
    ],
    adviseBeforeFixFunction: 'Ensure the specified S3 bucket exists and has proper permissions for CloudFront logging.'
  })

  private readonly stats: BPSetStats = {
    nonCompliantResources: [],
    compliantResources: [],
    status: 'LOADED',
    errorMessage: []
  }

  public readonly getStats = () => this.stats

  public readonly clearStats = () => {
    this.stats.compliantResources = []
    this.stats.nonCompliantResources = []
    this.stats.status = 'LOADED'
    this.stats.errorMessage = []
  }

  public readonly check = async () => {
    this.stats.status = 'CHECKING'

    await this.checkImpl().then(
      () => (this.stats.status = 'FINISHED'),
      (err) => {
        this.stats.status = 'ERROR'
        this.stats.errorMessage.push({
          date: new Date(),
          message: err.message
        })
      }
    )
  }

  private readonly checkImpl = async () => {
    const compliantResources: string[] = []
    const nonCompliantResources: string[] = []
    const distributions = await this.getDistributions()

    for (const distribution of distributions) {
      const { distribution: details } = await this.getDistributionDetails(distribution.Id!)
      if (details.DistributionConfig?.Logging?.Enabled) {
        compliantResources.push(details.ARN!)
      } else {
        nonCompliantResources.push(details.ARN!)
      }
    }

    this.stats.compliantResources = compliantResources
    this.stats.nonCompliantResources = nonCompliantResources
  }

  public readonly fix: BPSetFixFn = async (...args) => {
    await this.fixImpl(...args).then(
      () => (this.stats.status = 'FINISHED'),
      (err) => {
        this.stats.status = 'ERROR'
        this.stats.errorMessage.push({
          date: new Date(),
          message: err.message
        })
      }
    )
  }

  public readonly fixImpl: BPSetFixFn = async (nonCompliantResources, requiredParametersForFix) => {
    const logBucketName = requiredParametersForFix.find((param) => param.name === 'log-bucket-name')?.value

    if (!logBucketName) {
      throw new Error("Required parameter 'log-bucket-name' is missing.")
    }

    for (const arn of nonCompliantResources) {
      const distributionId = arn.split('/').pop()!
      const { distribution, etag } = await this.getDistributionDetails(distributionId)

      const updatedConfig = {
        ...distribution.DistributionConfig,
        Logging: {
          Enabled: true,
          Bucket: logBucketName,
          IncludeCookies: false,
          Prefix: ''
        }
      }

      await this.client.send(
        new UpdateDistributionCommand({
          Id: distributionId,
          IfMatch: etag,
          DistributionConfig: updatedConfig as DistributionConfig
        })
      )
    }
  }
}
