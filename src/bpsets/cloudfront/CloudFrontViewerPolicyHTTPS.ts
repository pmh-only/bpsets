import {
  CloudFrontClient,
  ListDistributionsCommand,
  GetDistributionCommand,
  UpdateDistributionCommand,
  DistributionConfig
} from '@aws-sdk/client-cloudfront'
import { BPSet, BPSetFixFn, BPSetStats } from '../../types'
import { Memorizer } from '../../Memorizer'

export class CloudFrontViewerPolicyHTTPS implements BPSet {
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
    name: 'CloudFrontViewerPolicyHTTPS',
    description: 'Ensures that CloudFront distributions enforce HTTPS for viewer requests.',
    priority: 1,
    priorityReason:
      'Enforcing HTTPS improves security by ensuring secure communication between viewers and CloudFront.',
    awsService: 'CloudFront',
    awsServiceCategory: 'CDN',
    bestPracticeCategory: 'Security',
    requiredParametersForFix: [],
    isFixFunctionUsesDestructiveCommand: false,
    commandUsedInCheckFunction: [
      {
        name: 'ListDistributionsCommand',
        reason: 'List all CloudFront distributions to check viewer protocol policies.'
      },
      {
        name: 'GetDistributionCommand',
        reason: 'Retrieve distribution details to verify viewer protocol policy settings.'
      }
    ],
    commandUsedInFixFunction: [
      {
        name: 'UpdateDistributionCommand',
        reason: 'Update the viewer protocol policy to enforce HTTPS.'
      }
    ],
    adviseBeforeFixFunction: 'Ensure all origins and endpoints support HTTPS to prevent connectivity issues.'
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
      const hasNonCompliantViewerPolicy =
        details.DistributionConfig?.DefaultCacheBehavior?.ViewerProtocolPolicy === 'allow-all' ||
        details.DistributionConfig?.CacheBehaviors?.Items?.some(
          (behavior) => behavior.ViewerProtocolPolicy === 'allow-all'
        )

      if (hasNonCompliantViewerPolicy) {
        nonCompliantResources.push(details.ARN!)
      } else {
        compliantResources.push(details.ARN!)
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

  public readonly fixImpl: BPSetFixFn = async (nonCompliantResources) => {
    for (const arn of nonCompliantResources) {
      const distributionId = arn.split('/').pop()!
      const { distribution, etag } = await this.getDistributionDetails(distributionId)

      const updatedConfig = {
        ...distribution.DistributionConfig,
        DefaultCacheBehavior: {
          ...distribution.DistributionConfig?.DefaultCacheBehavior,
          ViewerProtocolPolicy: 'redirect-to-https'
        },
        CacheBehaviors: {
          Items: distribution.DistributionConfig?.CacheBehaviors?.Items?.map((behavior) => ({
            ...behavior,
            ViewerProtocolPolicy: 'redirect-to-https'
          }))
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
