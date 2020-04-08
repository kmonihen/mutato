import * as codeBuild from '@aws-cdk/aws-codebuild';
import * as codePipeline from '@aws-cdk/aws-codepipeline';
import * as codePipelineActions from '@aws-cdk/aws-codepipeline-actions';
import * as cdk from '@aws-cdk/core';
import assert from 'assert';
import debug from 'debug';
import _ from 'lodash';
import { config } from '../config';
import { Container } from '../resources/container';
import { ActionInterface, ActionPropsInterface } from './interface';

const _debug = debug('mutato:actions:CodeBuild');

interface CodeBuildProps extends ActionPropsInterface {
  buildImage?: codeBuild.IBuildImage;
  container?: Container;
  pipeline: codePipeline.Pipeline;
  source: codePipeline.Artifact;
  sourceAction: codePipelineActions.GitHubSourceAction;
  spec: object | string;
  privileged?: boolean;
}

/** manual approval action in the pipeline */
export class CodeBuild implements ActionInterface {
  private readonly _props: CodeBuildProps;
  public readonly name: string;

  /**
   * @hideconstructor
   * @param props codebuild parameters
   */
  constructor(props: CodeBuildProps) {
    this._props = _.defaults(props, { order: 1, privileged: false });
    assert.ok(this._props.pipeline);
    assert.ok(this._props.source);
    assert.ok(this._props.spec);
    this.name = this._props.name;
  }

  /**
   * creates a codebuild approval action in the pipeline
   *
   * @param requester a unique ID used to prevent action duplication
   * @returns action construct to be added into a code pipeline
   */
  public action(requester = 'default'): codePipelineActions.CodeBuildAction {
    _debug('creating a code build action with props: %o', this._props);
    const project = new codeBuild.PipelineProject(
      cdk.Stack.of(this._props.pipeline),
      `action-project-${this.name}-${requester}`,
      {
        environment: {
          buildImage: this._props.buildImage
            ? this._props.buildImage
            : this._props.container
            ? this._props.container.repo
              ? codeBuild.LinuxBuildImage.fromEcrRepository(
                  this._props.container.repo,
                )
              : codeBuild.LinuxBuildImage.fromDockerRegistry(
                  this._props.container?.getImageUri(
                    this._props.pipeline,
                    true /* latest */,
                  ),
                )
            : undefined,
          privileged: this._props.privileged,
          environmentVariables: config.toBuildEnvironmentMap(),
        },
        buildSpec: _.isObject(this._props.spec)
          ? codeBuild.BuildSpec.fromObject(this._props.spec)
          : codeBuild.BuildSpec.fromSourceFilename(this._props.spec),
      },
    );

    this._props.container?.repo?.grantPullPush(project);
    const action = new codePipelineActions.CodeBuildAction({
      actionName: `${this.name}-${requester}`,
      input: this._props.source,
      environmentVariables: {
        mutato_opts__git__commit: {
          value: this._props.sourceAction.variables.commitId,
        },
      },
      project,
    });

    return action;
  }
}
