import {
  CloudFrontClient,
  ListDistributionsCommand,
  GetDistributionCommand,
  UpdateDistributionCommand
} from '@aws-sdk/client-cloudfront'
import { BPSet } from '../../types'
import { Memorizer } from '../../Memorizer'

export class CloudFrontS3OriginAccessControlEnabled implements BPSet {
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
      const hasNonCompliantOrigin = details.DistributionConfig?.Origins?.Items?.some(
        origin =>
          origin.S3OriginConfig &&
          (!origin.OriginAccessControlId || origin.OriginAccessControlId === '')
      )

      if (hasNonCompliantOrigin) {
        nonCompliantResources.push(details.ARN!)
      } else {
        compliantResources.push(details.ARN!)
      }
    }

    return {
      compliantResources,
      nonCompliantResources,
      requiredParametersForFix: [{ name: 'origin-access-control-id' }]
    }
  }

  public readonly fix = async (
    nonCompliantResources: string[],
    requiredParametersForFix: { name: string; value: string }[]
  ) => {
    const originAccessControlId = requiredParametersForFix.find(
      param => param.name === 'origin-access-control-id'
    )?.value

    if (!originAccessControlId) {
      throw new Error("Required parameter 'origin-access-control-id' is missing.")
    }

    for (const arn of nonCompliantResources) {
      const distributionId = arn.split('/').pop()!
      const { distribution, etag } = await this.getDistributionDetails(distributionId)

      const updatedConfig = {
        ...distribution.DistributionConfig,
        Origins: {
          Items: distribution.DistributionConfig?.Origins?.Items?.map(origin => {
            if (origin.S3OriginConfig) {
              return {
                ...origin,
                OriginAccessControlId: originAccessControlId
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
