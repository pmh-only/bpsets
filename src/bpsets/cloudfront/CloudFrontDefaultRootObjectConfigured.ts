import {
  CloudFrontClient,
  ListDistributionsCommand,
  GetDistributionCommand,
  UpdateDistributionCommand
} from '@aws-sdk/client-cloudfront'
import { BPSet } from '../BPSet'
import { Memorizer } from '../../Memorizer'

export class CloudFrontDefaultRootObjectConfigured implements BPSet {
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
      if (details.DistributionConfig?.DefaultRootObject !== '') {
        compliantResources.push(details.ARN!)
      } else {
        nonCompliantResources.push(details.ARN!)
      }
    }

    return {
      compliantResources,
      nonCompliantResources,
      requiredParametersForFix: [{ name: 'default-root-object' }]
    }
  }

  public readonly fix = async (
    nonCompliantResources: string[],
    requiredParametersForFix: { name: string; value: string }[]
  ) => {
    const defaultRootObject = requiredParametersForFix.find(param => param.name === 'default-root-object')?.value

    if (!defaultRootObject) {
      throw new Error("Required parameter 'default-root-object' is missing.")
    }

    for (const arn of nonCompliantResources) {
      const distributionId = arn.split('/').pop()!
      const { distribution, etag } = await this.getDistributionDetails(distributionId)

      const updatedConfig = {
        ...distribution.DistributionConfig,
        DefaultRootObject: defaultRootObject
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
