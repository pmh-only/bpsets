import {
  CloudFrontClient,
  ListDistributionsCommand,
  GetDistributionCommand,
  UpdateDistributionCommand
} from '@aws-sdk/client-cloudfront'
import { BPSet } from '../../types'
import { Memorizer } from '../../Memorizer'

export class CloudFrontAssociatedWithWAF implements BPSet {
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
      if (distribution.WebACLId && distribution.WebACLId !== '') {
        compliantResources.push(distribution.ARN!)
      } else {
        nonCompliantResources.push(distribution.ARN!)
      }
    }

    return {
      compliantResources,
      nonCompliantResources,
      requiredParametersForFix: [{ name: 'web-acl-id' }]
    }
  }

  public readonly fix = async (
    nonCompliantResources: string[],
    requiredParametersForFix: { name: string; value: string }[]
  ) => {
    const webAclId = requiredParametersForFix.find(param => param.name === 'web-acl-id')?.value

    if (!webAclId) {
      throw new Error("Required parameter 'web-acl-id' is missing.")
    }

    for (const arn of nonCompliantResources) {
      const distributionId = arn.split('/').pop()!
      const { distribution, etag } = await this.getDistributionDetails(distributionId)

      const updatedConfig = {
        ...distribution.DistributionConfig,
        WebACLId: webAclId
      }

      await this.client.send(
        new UpdateDistributionCommand({
          Id: distributionId,
          IfMatch: etag,
          DistributionConfig: updatedConfig as any // Include all required properties
        })
      )
    }
  }
}
