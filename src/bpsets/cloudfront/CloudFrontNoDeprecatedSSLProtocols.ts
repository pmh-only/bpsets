import {
  CloudFrontClient,
  ListDistributionsCommand,
  GetDistributionCommand,
  UpdateDistributionCommand,
  DistributionConfig
} from '@aws-sdk/client-cloudfront'
import { BPSet, BPSetFixFn, BPSetStats } from '../../types'
import { Memorizer } from '../../Memorizer'

export class CloudFrontNoDeprecatedSSLProtocols implements BPSet {
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
    name: 'CloudFrontNoDeprecatedSSLProtocols',
    description: 'Ensures that CloudFront distributions do not use deprecated SSL protocols like SSLv3.',
    priority: 2,
    priorityReason: 'Deprecated SSL protocols pose significant security risks and should be avoided.',
    awsService: 'CloudFront',
    awsServiceCategory: 'CDN',
    bestPracticeCategory: 'Security',
    requiredParametersForFix: [],
    isFixFunctionUsesDestructiveCommand: false,
    commandUsedInCheckFunction: [
      {
        name: 'ListDistributionsCommand',
        reason: 'List all CloudFront distributions to check for deprecated SSL protocols.'
      },
      {
        name: 'GetDistributionCommand',
        reason: 'Retrieve distribution details to identify deprecated SSL protocols in origin configuration.'
      }
    ],
    commandUsedInFixFunction: [
      {
        name: 'UpdateDistributionCommand',
        reason: 'Remove deprecated SSL protocols from the origin configuration of the distribution.'
      }
    ],
    adviseBeforeFixFunction: 'Ensure the origins are configured to support only secure and modern SSL protocols.'
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
      const hasDeprecatedSSL = details.DistributionConfig?.Origins?.Items?.some(
        (origin) => origin.CustomOriginConfig && origin.CustomOriginConfig.OriginSslProtocols?.Items?.includes('SSLv3')
      )

      if (hasDeprecatedSSL) {
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
        Origins: {
          Items: distribution.DistributionConfig?.Origins?.Items?.map((origin) => {
            if (origin.CustomOriginConfig) {
              return {
                ...origin,
                CustomOriginConfig: {
                  ...origin.CustomOriginConfig,
                  OriginSslProtocols: {
                    ...origin.CustomOriginConfig.OriginSslProtocols,
                    Items: origin.CustomOriginConfig.OriginSslProtocols?.Items?.filter(
                      (protocol) => protocol !== 'SSLv3'
                    )
                  }
                }
              }
            }
            return origin
          })
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
