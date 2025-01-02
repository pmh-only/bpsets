import {
  ApiGatewayV2Client,
  GetApisCommand,
  GetStagesCommand,
} from '@aws-sdk/client-apigatewayv2';
import {
  WAFV2Client,
  GetWebACLForResourceCommand,
  AssociateWebACLCommand,
} from '@aws-sdk/client-wafv2';
import { BPSet, BPSetFixFn, BPSetStats } from '../../types';
import { Memorizer } from '../../Memorizer';

export class APIGatewayAssociatedWithWAF implements BPSet {
  private readonly client = new ApiGatewayV2Client({});
  private readonly memoClient = Memorizer.memo(this.client);
  private readonly wafClient = Memorizer.memo(new WAFV2Client({}));

  private readonly getHttpApis = async () => {
    const response = await this.memoClient.send(new GetApisCommand({}));
    return response.Items || [];
  };

  private readonly getStages = async (apiId: string) => {
    const response = await this.memoClient.send(new GetStagesCommand({ ApiId: apiId }));
    return response.Items || [];
  };

  public readonly getMetadata = () => ({
    name: 'APIGatewayAssociatedWithWAF',
    description: 'Ensures that API Gateway stages are associated with WAF.',
    priority: 2,
    priorityReason: 'Associating WAF with API Gateway stages enhances security by protecting against web attacks.',
    awsService: 'API Gateway',
    awsServiceCategory: 'API Management',
    bestPracticeCategory: 'Security',
    requiredParametersForFix: [
      {
        name: 'web-acl-arn',
        description: 'The ARN of the WAF ACL to associate with the API Gateway stage.',
        default: '',
        example: 'arn:aws:wafv2:us-east-1:123456789012:regional/webacl/example',
      },
    ],
    isFixFunctionUsesDestructiveCommand: false,
    commandUsedInCheckFunction: [
      {
        name: 'GetWebACLForResourceCommand',
        reason: 'Verify if a WAF is associated with the API Gateway stage.',
      },
    ],
    commandUsedInFixFunction: [
      {
        name: 'AssociateWebACLCommand',
        reason: 'Associate a WAF ACL with the API Gateway stage.',
      },
    ],
    adviseBeforeFixFunction: 'Ensure the WAF ACL has the appropriate rules for the application\'s requirements.',
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
    const apis = await this.getHttpApis();

    for (const api of apis) {
      const stages = await this.getStages(api.ApiId!);
      for (const stage of stages) {
        const stageArn = `arn:aws:apigateway:${this.client.config.region}::/apis/${api.ApiId}/stages/${stage.StageName}`;
        const response = await this.wafClient.send(
          new GetWebACLForResourceCommand({ ResourceArn: stageArn })
        );

        if (response.WebACL) {
          compliantResources.push(stageArn);
        } else {
          nonCompliantResources.push(stageArn);
        }
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
    const webAclArn = requiredParametersForFix.find((param) => param.name === 'web-acl-arn')?.value;

    if (!webAclArn) {
      throw new Error("Required parameter 'web-acl-arn' is missing.");
    }

    for (const stageArn of nonCompliantResources) {
      await this.wafClient.send(
        new AssociateWebACLCommand({
          ResourceArn: stageArn,
          WebACLArn: webAclArn,
        })
      );
    }
  };
}
