import {
  ElasticLoadBalancingV2Client,
  DescribeLoadBalancersCommand,
  DescribeLoadBalancerAttributesCommand,
  ModifyLoadBalancerAttributesCommand
} from '@aws-sdk/client-elastic-load-balancing-v2'
import { BPSet } from '../../types'
import { Memorizer } from '../../Memorizer'

export class ELBLoggingEnabled implements BPSet {
  private readonly client = new ElasticLoadBalancingV2Client({})
  private readonly memoClient = Memorizer.memo(this.client)

  private readonly getLoadBalancers = async () => {
    const response = await this.memoClient.send(new DescribeLoadBalancersCommand({}))
    return response.LoadBalancers || []
  }

  private readonly getLoadBalancerAttributes = async (loadBalancerArn: string) => {
    const response = await this.memoClient.send(
      new DescribeLoadBalancerAttributesCommand({ LoadBalancerArn: loadBalancerArn })
    )
    return response.Attributes || []
  }

  public readonly check = async () => {
    const compliantResources = []
    const nonCompliantResources = []
    const loadBalancers = await this.getLoadBalancers()

    for (const lb of loadBalancers) {
      const attributes = await this.getLoadBalancerAttributes(lb.LoadBalancerArn!)
      const isEnabled = attributes.some(
        attr => attr.Key === 'access_logs.s3.enabled' && attr.Value === 'true'
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
      requiredParametersForFix: [{ name: 's3-bucket-name' }, { name: 's3-prefix' }]
    }
  }

  public readonly fix = async (
    nonCompliantResources: string[],
    requiredParametersForFix: { name: string; value: string }[]
  ) => {
    const bucketName = requiredParametersForFix.find(param => param.name === 's3-bucket-name')?.value
    const bucketPrefix = requiredParametersForFix.find(param => param.name === 's3-prefix')?.value

    if (!bucketName || !bucketPrefix) {
      throw new Error("Required parameters 's3-bucket-name' and/or 's3-prefix' are missing.")
    }

    for (const lbArn of nonCompliantResources) {
      await this.client.send(
        new ModifyLoadBalancerAttributesCommand({
          LoadBalancerArn: lbArn,
          Attributes: [
            { Key: 'access_logs.s3.enabled', Value: 'true' },
            { Key: 'access_logs.s3.bucket', Value: bucketName },
            { Key: 'access_logs.s3.prefix', Value: bucketPrefix }
          ]
        })
      )
    }
  }
}
