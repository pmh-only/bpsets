import {
  ElasticLoadBalancingV2Client,
  DescribeLoadBalancersCommand,
  DescribeLoadBalancerAttributesCommand,
  ModifyLoadBalancerAttributesCommand,
} from '@aws-sdk/client-elastic-load-balancing-v2';
import { BPSet, BPSetFixFn, BPSetStats } from '../../types';
import { Memorizer } from '../../Memorizer';

export class ELBLoggingEnabled implements BPSet {
  private readonly client = new ElasticLoadBalancingV2Client({});
  private readonly memoClient = Memorizer.memo(this.client);

  private readonly getLoadBalancers = async () => {
    const response = await this.memoClient.send(new DescribeLoadBalancersCommand({}));
    return response.LoadBalancers || [];
  };

  private readonly getLoadBalancerAttributes = async (loadBalancerArn: string) => {
    const response = await this.memoClient.send(
      new DescribeLoadBalancerAttributesCommand({ LoadBalancerArn: loadBalancerArn })
    );
    return response.Attributes || [];
  };

  public readonly getMetadata = () => ({
    name: 'ELBLoggingEnabled',
    description: 'Ensures that access logging is enabled for Elastic Load Balancers.',
    priority: 1,
    priorityReason: 'Access logging provides critical data for troubleshooting and compliance.',
    awsService: 'Elastic Load Balancing',
    awsServiceCategory: 'Classic Load Balancer',
    bestPracticeCategory: 'Logging and Monitoring',
    requiredParametersForFix: [
      { name: 's3-bucket-name', description: 'The S3 bucket for storing access logs.', default: '', example: 'my-log-bucket' },
      { name: 's3-prefix', description: 'The S3 prefix for the access logs.', default: '', example: 'elb/logs/' },
    ],
    isFixFunctionUsesDestructiveCommand: false,
    commandUsedInCheckFunction: [
      {
        name: 'DescribeLoadBalancerAttributesCommand',
        reason: 'Verify if access logging is enabled for ELBs.',
      },
    ],
    commandUsedInFixFunction: [
      {
        name: 'ModifyLoadBalancerAttributesCommand',
        reason: 'Enable access logging for ELBs and set S3 bucket and prefix.',
      },
    ],
    adviseBeforeFixFunction: 'Ensure the specified S3 bucket and prefix exist and are accessible.',
  });

  private readonly stats: BPSetStats = {
    nonCompliantResources: [],
    compliantResources: [],
    status: 'LOADED',
    errorMessage: [],
  };

  public readonly getStats = () => this.stats;

  public readonly clearStats = () => {
    this.stats.compliantResources = [];
    this.stats.nonCompliantResources = [];
    this.stats.status = 'LOADED';
    this.stats.errorMessage = [];
  };

  public readonly check = async () => {
    this.stats.status = 'CHECKING';

    await this.checkImpl().then(
      () => (this.stats.status = 'FINISHED'),
      (err) => {
        this.stats.status = 'ERROR';
        this.stats.errorMessage.push({
          date: new Date(),
          message: err.message,
        });
      }
    );
  };

  private readonly checkImpl = async () => {
    const compliantResources: string[] = [];
    const nonCompliantResources: string[] = [];
    const loadBalancers = await this.getLoadBalancers();

    for (const lb of loadBalancers) {
      const attributes = await this.getLoadBalancerAttributes(lb.LoadBalancerArn!);
      const isEnabled = attributes.some(
        (attr) => attr.Key === 'access_logs.s3.enabled' && attr.Value === 'true'
      );

      if (isEnabled) {
        compliantResources.push(lb.LoadBalancerArn!);
      } else {
        nonCompliantResources.push(lb.LoadBalancerArn!);
      }
    }

    this.stats.compliantResources = compliantResources;
    this.stats.nonCompliantResources = nonCompliantResources;
  };

  public readonly fix: BPSetFixFn = async (...args) => {
    await this.fixImpl(...args).then(
      () => (this.stats.status = 'FINISHED'),
      (err) => {
        this.stats.status = 'ERROR';
        this.stats.errorMessage.push({
          date: new Date(),
          message: err.message,
        });
      }
    );
  };

  public readonly fixImpl: BPSetFixFn = async (nonCompliantResources, requiredParametersForFix) => {
    const bucketName = requiredParametersForFix.find((param) => param.name === 's3-bucket-name')?.value;
    const bucketPrefix = requiredParametersForFix.find((param) => param.name === 's3-prefix')?.value;

    if (!bucketName || !bucketPrefix) {
      throw new Error("Required parameters 's3-bucket-name' and/or 's3-prefix' are missing.");
    }

    for (const lbArn of nonCompliantResources) {
      await this.client.send(
        new ModifyLoadBalancerAttributesCommand({
          LoadBalancerArn: lbArn,
          Attributes: [
            { Key: 'access_logs.s3.enabled', Value: 'true' },
            { Key: 'access_logs.s3.bucket', Value: bucketName },
            { Key: 'access_logs.s3.prefix', Value: bucketPrefix },
          ],
        })
      );
    }
  };
}
