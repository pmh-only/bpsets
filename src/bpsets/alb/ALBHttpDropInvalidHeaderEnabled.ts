import {
  ElasticLoadBalancingV2Client,
  DescribeLoadBalancersCommand,
  DescribeLoadBalancerAttributesCommand,
  ModifyLoadBalancerAttributesCommand
} from '@aws-sdk/client-elastic-load-balancing-v2'
import { BPSet } from '../../types'
import { Memorizer } from '../../Memorizer'

export class ALBHttpDropInvalidHeaderEnabled implements BPSet {
  private readonly client = new ElasticLoadBalancingV2Client({})
  private readonly memoClient = Memorizer.memo(this.client)

  private readonly getLoadBalancers = async () => {
    const response = await this.memoClient.send(new DescribeLoadBalancersCommand({}))
    return response.LoadBalancers || []
  }

  private readonly getLoadBalancerAttributes = async (
    loadBalancerArn: string
  ) => {
    const response = await this.memoClient.send(
      new DescribeLoadBalancerAttributesCommand({ LoadBalancerArn: loadBalancerArn })
    )
    return response.Attributes || []
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
      const attributes = await this.getLoadBalancerAttributes(lb.LoadBalancerArn!)
      const isEnabled = attributes.some(
        attr => attr.Key === 'routing.http.drop_invalid_header_fields.enabled' && attr.Value === 'true'
      )

      if (isEnabled) {
        compliantResources.push(lb.LoadBalancerArn!)
      } else {
        nonCompliantResources.push(lb.LoadBalancerArn!)
      }
    }

    return {
      compliantResources,
      nonCompliantResources,
      requiredParametersForFix: []
    }
  }

  public readonly fix = async (
    nonCompliantResources: string[],
    requiredParametersForFix: { name: string; value: string }[]
  ): Promise<void> => {
    for (const lbArn of nonCompliantResources) {
      await this.client.send(
        new ModifyLoadBalancerAttributesCommand({
          LoadBalancerArn: lbArn,
          Attributes: [
            { Key: 'routing.http.drop_invalid_header_fields.enabled', Value: 'true' }
          ]
        })
      )
    }
  }
}
