import {
  CloudFrontClient,
  ListDistributionsCommand,
  GetDistributionCommand,
  UpdateDistributionCommand
} from '@aws-sdk/client-cloudfront'
import { BPSet } from '../BPSet'
import { Memorizer } from '../../Memorizer'

export class CloudFrontViewerPolicyHTTPS implements BPSet {
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
      const hasNonCompliantViewerPolicy =
        details.DistributionConfig?.DefaultCacheBehavior?.ViewerProtocolPolicy === 'allow-all' ||
        details.DistributionConfig?.CacheBehaviors?.Items?.some(
          behavior => behavior.ViewerProtocolPolicy === 'allow-all'
        )

      if (hasNonCompliantViewerPolicy) {
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
        DefaultCacheBehavior: {
          ...distribution.DistributionConfig?.DefaultCacheBehavior,
          ViewerProtocolPolicy: 'redirect-to-https'
        },
        CacheBehaviors: {
          Items: distribution.DistributionConfig?.CacheBehaviors?.Items?.map(behavior => ({
            ...behavior,
            ViewerProtocolPolicy: 'redirect-to-https'
          }))
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
