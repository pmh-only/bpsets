import {
  CloudFrontClient,
  ListDistributionsCommand,
  GetDistributionCommand,
  UpdateDistributionCommand
} from '@aws-sdk/client-cloudfront'
import { BPSet, BPSetFixFn, BPSetStats } from '../../types'
import { Memorizer } from '../../Memorizer'

export class CloudFrontAssociatedWithWAF implements BPSet {
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
    name: 'CloudFrontAssociatedWithWAF',
    description: 'Ensures that CloudFront distributions are associated with a WAF.',
    priority: 1,
    priorityReason: 'Associating WAF with CloudFront distributions enhances security against web attacks.',
    awsService: 'CloudFront',
    awsServiceCategory: 'CDN',
    bestPracticeCategory: 'Security',
    requiredParametersForFix: [
      {
        name: 'web-acl-id',
        description: 'The ID of the Web ACL to associate with the CloudFront distribution.',
        default: '',
        example: 'arn:aws:wafv2:us-east-1:123456789012:regional/webacl/example'
      }
    ],
    isFixFunctionUsesDestructiveCommand: false,
    commandUsedInCheckFunction: [
      {
        name: 'ListDistributionsCommand',
        reason: 'List all CloudFront distributions to check for WAF association.'
      }
    ],
    commandUsedInFixFunction: [
      {
        name: 'UpdateDistributionCommand',
        reason: 'Associate the specified WAF with the CloudFront distribution.'
      }
    ],
    adviseBeforeFixFunction: 'Ensure the Web ACL is configured correctly for the application’s security requirements.'
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
      if (distribution.WebACLId && distribution.WebACLId !== '') {
        compliantResources.push(distribution.ARN!)
      } else {
        nonCompliantResources.push(distribution.ARN!)
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
    const webAclId = requiredParametersForFix.find((param) => param.name === 'web-acl-id')?.value

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
          DistributionConfig: updatedConfig as unknown
        })
      )
    }
  }
}
