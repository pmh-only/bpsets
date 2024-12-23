import {
  CloudFrontClient,
  ListDistributionsCommand,
  GetDistributionCommand,
  UpdateDistributionCommand
} from '@aws-sdk/client-cloudfront'
import { BPSet } from '../BPSet'
import { Memorizer } from '../../Memorizer'

export class CloudFrontNoDeprecatedSSLProtocols implements BPSet {
  private readonly client = new CloudFrontClient({})
  private readonly memoClient = Memorizer.memo(this.client)

  private readonly getDistributions = async () => {
    const response = await this.memoClient.send(new ListDistributionsCommand({}))
    return response.DistributionList?.Items || []
  }

  private readonly getDistributionDetails = async (distributionId: string) => {
    const response = await this.memoClient.send(
      new GetDistributionCommand({ Id: distributionId })
    )
    return {
      distribution: response.Distribution!,
      etag: response.ETag!
    }
  }

  public readonly check = async () => {
    const compliantResources = []
    const nonCompliantResources = []
    const distributions = await this.getDistributions()

    for (const distribution of distributions) {
      const { distribution: details } = await this.getDistributionDetails(distribution.Id!)
      const hasDeprecatedSSL = details.DistributionConfig?.Origins?.Items?.some(
        origin =>
          origin.CustomOriginConfig &&
          origin.CustomOriginConfig.OriginSslProtocols?.Items?.includes('SSLv3')
      )

      if (hasDeprecatedSSL) {
        nonCompliantResources.push(details.ARN!)
      } else {
        compliantResources.push(details.ARN!)
      }
    }

    return {
      compliantResources,
      nonCompliantResources,
      requiredParametersForFix: []
    }
  }

  public readonly fix = async (nonCompliantResources: string[]) => {
    for (const arn of nonCompliantResources) {
      const distributionId = arn.split('/').pop()!
      const { distribution, etag } = await this.getDistributionDetails(distributionId)

      const updatedConfig = {
        ...distribution.DistributionConfig,
        Origins: {
          Items: distribution.DistributionConfig?.Origins?.Items?.map(origin => {
            if (origin.CustomOriginConfig) {
              return {
                ...origin,
                CustomOriginConfig: {
                  ...origin.CustomOriginConfig,
                  OriginSslProtocols: {
                    ...origin.CustomOriginConfig.OriginSslProtocols,
                    Items: origin.CustomOriginConfig.OriginSslProtocols?.Items?.filter(
                      protocol => protocol !== 'SSLv3'
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
          DistributionConfig: updatedConfig as any
        })
      )
    }
  }
}
