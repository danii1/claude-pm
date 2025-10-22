/**
 * Jira API integration
 */

import type { Config } from './config';

export interface JiraStory {
  key: string;
  url: string;
  id: string;
}

export interface JiraTask {
  key: string;
  url: string;
}

export class JiraClient {
  private baseUrl: string;
  private auth: string;
  private config: Config['jira'];

  constructor(config: Config['jira']) {
    this.config = config;
    this.baseUrl = `https://${config.domain}/rest/api/3`;
    this.auth = Buffer.from(`${config.email}:${config.apiToken}`).toString('base64');
  }

  private async request<T>(
    endpoint: string,
    method: string = 'GET',
    body?: unknown
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    const headers = {
      'Authorization': `Basic ${this.auth}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    };

    const response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Jira API error (${response.status}): ${errorText}`
      );
    }

    return response.json() as T;
  }

  async createStory(summary: string, description: string): Promise<JiraStory> {
    const issueData = {
      fields: {
        project: {
          key: this.config.projectKey,
        },
        summary,
        description: {
          type: 'doc',
          version: 1,
          content: [
            {
              type: 'paragraph',
              content: [
                {
                  type: 'text',
                  text: description,
                },
              ],
            },
          ],
        },
        issuetype: {
          name: 'Story',
        },
      },
    };

    const result = await this.request<{ key: string; id: string }>(
      '/issue',
      'POST',
      issueData
    );

    return {
      key: result.key,
      id: result.id,
      url: `https://${this.config.domain}/browse/${result.key}`,
    };
  }

  async createSubtask(
    parentKey: string,
    summary: string,
    description?: string
  ): Promise<JiraTask> {
    const issueData = {
      fields: {
        project: {
          key: this.config.projectKey,
        },
        parent: {
          key: parentKey,
        },
        summary,
        description: description
          ? {
              type: 'doc',
              version: 1,
              content: [
                {
                  type: 'paragraph',
                  content: [
                    {
                      type: 'text',
                      text: description,
                    },
                  ],
                },
              ],
            }
          : undefined,
        issuetype: {
          name: 'Subtask',
        },
      },
    };

    const result = await this.request<{ key: string }>(
      '/issue',
      'POST',
      issueData
    );

    return {
      key: result.key,
      url: `https://${this.config.domain}/browse/${result.key}`,
    };
  }

  async linkIssues(
    inwardIssue: string,
    outwardIssue: string,
    linkType: string = 'Relates'
  ): Promise<void> {
    await this.request('/issueLink', 'POST', {
      type: {
        name: linkType,
      },
      inwardIssue: {
        key: inwardIssue,
      },
      outwardIssue: {
        key: outwardIssue,
      },
    });
  }

  async linkToEpic(storyKey: string, epicKey: string): Promise<void> {
    // In Jira API v3, you link to an epic by setting the parent field
    await this.request(
      `/issue/${storyKey}`,
      'PUT',
      {
        fields: {
          parent: {
            key: epicKey,
          },
        },
      }
    );
  }
}
