import { ElasticLoadBalancingV2Client, DescribeLoadBalancersCommand } from '@aws-sdk/client-elastic-load-balancing-v2'
import { WAFV2Client, GetWebACLForResourceCommand, AssociateWebACLCommand } from '@aws-sdk/client-wafv2'
import { BPSet } from '../BPSet'
import { Memorizer } from '../../Memorizer'

export class ALBWAFEnabled implements BPSet {
  private readonly client = new ElasticLoadBalancingV2Client({})
  private readonly memoClient = Memorizer.memo(this.client)
  private readonly wafClient = Memorizer.memo(new WAFV2Client({}))

  private readonly getLoadBalancers = async () => {
    const response = await this.memoClient.send(new DescribeLoadBalancersCommand({}))
    return response.LoadBalancers || []
  }

  public readonly check = async (): Promise<{
    compliantResources: string[]
    nonCompliantResources: string[]
    requiredParametersForFix: { name: string }[]
  }> => {
    const compliantResources: string[] = []
    const nonCompliantResources: string[] = []
    const loadBalancers = await this.getLoadBalancers()

    for (const lb of loadBalancers) {
      const response = await this.wafClient.send(
        new GetWebACLForResourceCommand({ ResourceArn: lb.LoadBalancerArn })
      )
      if (response.WebACL) {
        compliantResources.push(lb.LoadBalancerArn!)
      } else {
        nonCompliantResources.push(lb.LoadBalancerArn!)
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
  ): Promise<void> => {
    const webAclArn = requiredParametersForFix.find(param => param.name === 'web-acl-arn')?.value

    if (!webAclArn) {
      throw new Error("Required parameter 'web-acl-arn' is missing.")
    }

    for (const lbArn of nonCompliantResources) {
      await this.wafClient.send(
        new AssociateWebACLCommand({
          ResourceArn: lbArn,
          WebACLArn: webAclArn
        })
      )
    }
  }
}
