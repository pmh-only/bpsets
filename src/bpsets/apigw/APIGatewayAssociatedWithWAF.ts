import {
  ApiGatewayV2Client,
  GetApisCommand,
  GetStagesCommand
} from '@aws-sdk/client-apigatewayv2'
import { WAFV2Client, GetWebACLForResourceCommand, AssociateWebACLCommand } from '@aws-sdk/client-wafv2'
import { BPSet } from '../BPSet'
import { Memorizer } from '../../Memorizer'

export class APIGatewayAssociatedWithWAF implements BPSet {
  private readonly client = new ApiGatewayV2Client({})
  private readonly memoClient = Memorizer.memo(this.client)
  private readonly wafClient = Memorizer.memo(new WAFV2Client({}))

  private readonly getHttpApis = async () => {
    const response = await this.memoClient.send(new GetApisCommand({}))
    return response.Items || []
  }

  private readonly getStages = async (apiId: string) => {
    const response = await this.memoClient.send(new GetStagesCommand({ ApiId: apiId }))
    return response.Items || []
  }

  public readonly check = async () => {
    const compliantResources = []
    const nonCompliantResources = []
    const apis = await this.getHttpApis()

    for (const api of apis) {
      const stages = await this.getStages(api.ApiId!)
      for (const stage of stages) {
        const stageArn = `arn:aws:apigateway:${this.client.config.region}::/apis/${api.ApiId}/stages/${stage.StageName}`
        const response = await this.wafClient.send(new GetWebACLForResourceCommand({ ResourceArn: stageArn }))

        if (response.WebACL) {
          compliantResources.push(stageArn)
        } else {
          nonCompliantResources.push(stageArn)
        }
      }
    }

    return {
      compliantResources,
      nonCompliantResources,
      requiredParametersForFix: [{ name: 'web-acl-arn' }]
    }
  }

  public readonly fix = async (
    nonCompliantResources: string[],
    requiredParametersForFix: { name: string; value: string }[]
  ) => {
    const webAclArn = requiredParametersForFix.find(param => param.name === 'web-acl-arn')?.value

    if (!webAclArn) {
      throw new Error("Required parameter 'web-acl-arn' is missing.")
    }

    for (const stageArn of nonCompliantResources) {
      await this.wafClient.send(
        new AssociateWebACLCommand({
          ResourceArn: stageArn,
          WebACLArn: webAclArn
        })
      )
    }
  }
}
