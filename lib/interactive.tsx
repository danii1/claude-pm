import React, { useState, useRef } from 'react';
import { render, Box, Text, useInput, useApp } from 'ink';
import { ScrollView, type ScrollViewRef } from 'ink-scroll-view';
import { MarkdownText } from './MarkdownText';

interface Task {
  summary: string;
  description: string;
  type: 'Story' | 'Task' | 'Bug' | 'Epic';
}

interface InteractiveState {
  step: 'source-type' | 'source-input' | 'custom' | 'epic' | 'style' | 'issue-type' | 'confirm' | 'generating' | 'preview' | 'edit-prompt' | 'regenerating' | 'done' | 'success';
  sourceType?: 'figma' | 'log' | 'prompt';
  sourceContent?: string;
  customInstructions?: string;
  epicKey?: string;
  promptStyle: 'pm' | 'technical';
  issueType: string;
  decompose: boolean;
  tasks: Task[];
  previewData?: {
    summary: string;
    description: string;
  };
  editPrompt?: string;
  successMessage?: string;
}

export interface InteractiveModeHandle {
  setGenerating: () => void;
  setPreviewData: (summary: string, description: string) => void;
  waitForCompletion: () => Promise<InteractiveState>;
  waitForEdit: () => Promise<{ editPrompt: string; currentSummary: string; currentDescription: string }>;
  showSuccess: (message: string) => void;
  restart: () => void;
  cleanup: () => void;
}

export async function runInteractiveMode(): Promise<InteractiveModeHandle> {
  return new Promise((resolve, reject) => {
    let completed = false;
    let updateState: ((updates: Partial<InteractiveState>) => void) | null = null;
    let completePromiseResolve: ((config: InteractiveState) => void) | null = null;
    let editPromiseResolve: ((data: { editPrompt: string; currentSummary: string; currentDescription: string }) => void) | null = null;

    const InteractiveFormWithPreview: React.FC = () => {
      const { exit } = useApp();
      const [state, setState] = useState<InteractiveState>({
        step: 'source-type',
        promptStyle: 'pm',
        issueType: 'Story',
        decompose: false,
        tasks: [],
      });
      const [input, setInput] = useState('');
      const scrollViewRef = useRef<ScrollViewRef>(null);

      // Expose setState to parent
      React.useEffect(() => {
        updateState = (updates) => {
          setState(prev => ({ ...prev, ...updates }));
        };
      }, []);

      useInput((inputChar, key) => {
        if (key.ctrl && inputChar === 'c') {
          exit();
          return;
        }

        // Success screen - any key restarts
        if (state.step === 'success') {
          setState({
            step: 'source-type',
            promptStyle: 'pm',
            issueType: 'Story',
            decompose: false,
            tasks: [],
          });
          setInput('');
          return;
        }

        // Handle scrolling in preview mode
        if (state.step === 'preview') {
          if (key.upArrow) {
            scrollViewRef.current?.scrollBy(-1);
            return;
          }
          if (key.downArrow) {
            const ref = scrollViewRef.current;
            if (ref) {
              const currentOffset = ref.getScrollOffset();
              const bottomOffset = ref.getBottomOffset();
              // Only scroll if we haven't reached the bottom
              if (currentOffset < bottomOffset) {
                ref.scrollBy(1);
              }
            }
            return;
          }
          if (key.pageUp) {
            const ref = scrollViewRef.current;
            if (ref) {
              const height = ref.getViewportHeight() || 1;
              ref.scrollBy(-height);
            }
            return;
          }
          if (key.pageDown) {
            const ref = scrollViewRef.current;
            if (ref) {
              const height = ref.getViewportHeight() || 1;
              const currentOffset = ref.getScrollOffset();
              const bottomOffset = ref.getBottomOffset();
              // Only scroll if we haven't reached the bottom
              if (currentOffset < bottomOffset) {
                ref.scrollBy(Math.min(height, bottomOffset - currentOffset));
              }
            }
            return;
          }
        }

        if (key.escape) {
          handleEscape();
          return;
        }

        if (key.return) {
          handleEnter();
          return;
        }

        if (key.backspace || key.delete) {
          setInput(prev => prev.slice(0, -1));
          return;
        }

        if (!key.ctrl && !key.meta && inputChar) {
          if (state.step === 'source-type' && ['1', '2', '3'].includes(inputChar)) {
            const sourceType = inputChar === '1' ? 'figma' : inputChar === '2' ? 'log' : 'prompt';
            setState(prev => ({ ...prev, sourceType, step: 'source-input' }));
            setInput('');
            return;
          }

          if (state.step === 'issue-type' && ['1', '2', '3', '4'].includes(inputChar)) {
            const types = ['Story', 'Task', 'Bug', 'Epic'] as const;
            const issueType = types[parseInt(inputChar) - 1]!;
            setState(prev => ({ ...prev, issueType, step: 'style' }));
            setInput('');
            return;
          }

          if (state.step === 'style' && ['1', '2'].includes(inputChar)) {
            const promptStyle = inputChar === '1' ? 'pm' : 'technical';
            setState(prev => ({ ...prev, promptStyle, decompose: false, step: 'confirm' }));
            setInput('');
            return;
          }

          if (state.step === 'confirm' && ['y', 'n'].includes(inputChar.toLowerCase())) {
            if (inputChar.toLowerCase() === 'y') {
              setState(prev => ({ ...prev, step: 'generating' }));
              if (completePromiseResolve) {
                completed = true;
                completePromiseResolve(state);
              }
            } else {
              setState(prev => ({ ...prev, step: 'source-type' }));
              setInput('');
            }
            return;
          }

          if (state.step === 'preview') {
            if (inputChar.toLowerCase() === 'e') {
              setState(prev => ({ ...prev, step: 'edit-prompt' }));
              setInput('');
              return;
            }
            if (['y', 'n'].includes(inputChar.toLowerCase())) {
              if (inputChar.toLowerCase() === 'y') {
                setState(prev => ({ ...prev, step: 'done' }));
                if (completePromiseResolve) {
                  completed = true;
                  completePromiseResolve(state);
                }
              } else {
                setState(prev => ({
                  ...prev,
                  step: 'source-type',
                  previewData: undefined
                }));
                setInput('');
              }
              return;
            }
          }

          setInput(prev => prev + inputChar);
        }
      });

      const handleEscape = () => {
        switch (state.step) {
          case 'source-input':
            setInput('');
            setState(prev => ({ ...prev, step: 'source-type' }));
            break;
          case 'custom':
            setInput(state.sourceContent || '');
            setState(prev => ({ ...prev, step: 'source-input' }));
            break;
          case 'epic':
            setInput(state.customInstructions || '');
            setState(prev => ({ ...prev, step: 'custom' }));
            break;
          case 'issue-type':
            setInput(state.epicKey || '');
            setState(prev => ({ ...prev, step: 'epic' }));
            break;
          case 'style':
            setInput('');
            setState(prev => ({ ...prev, step: 'issue-type' }));
            break;
          case 'confirm':
            setInput('');
            setState(prev => ({ ...prev, step: 'style' }));
            break;
          case 'preview':
            break;
          case 'edit-prompt':
            setInput('');
            setState(prev => ({ ...prev, step: 'preview' }));
            break;
        }
      };

      const handleEnter = () => {
        const trimmedInput = input.trim();

        switch (state.step) {
          case 'source-type':
            if (['1', '2', '3'].includes(trimmedInput)) {
              const sourceType = trimmedInput === '1' ? 'figma' : trimmedInput === '2' ? 'log' : 'prompt';
              setState(prev => ({ ...prev, sourceType, step: 'source-input' }));
              setInput('');
            }
            break;

          case 'source-input':
            if (trimmedInput) {
              setState(prev => ({ ...prev, sourceContent: trimmedInput, step: 'custom' }));
              setInput('');
            }
            break;

          case 'custom':
            setState(prev => ({
              ...prev,
              customInstructions: trimmedInput || undefined,
              step: 'epic'
            }));
            setInput('');
            break;

          case 'epic':
            setState(prev => ({
              ...prev,
              epicKey: trimmedInput || undefined,
              step: 'issue-type'
            }));
            setInput('');
            break;

          case 'issue-type': {
            if (['1', '2', '3', '4'].includes(trimmedInput)) {
              const types = ['Story', 'Task', 'Bug', 'Epic'];
              const issueType = types[parseInt(trimmedInput) - 1]!;
              setState(prev => ({ ...prev, issueType, step: 'style' }));
              setInput('');
            } else if (trimmedInput) {
              setState(prev => ({ ...prev, issueType: trimmedInput, step: 'style' }));
              setInput('');
            }
            break;
          }

          case 'style':
            if (['1', '2'].includes(trimmedInput)) {
              const promptStyle = trimmedInput === '1' ? 'pm' : 'technical';
              setState(prev => ({ ...prev, promptStyle, decompose: false, step: 'confirm' }));
              setInput('');
            }
            break;

          case 'confirm':
            if (['y', 'n', ''].includes(trimmedInput.toLowerCase())) {
              if (trimmedInput.toLowerCase() === 'y' || trimmedInput === '') {
                setState(prev => ({ ...prev, step: 'generating' }));
                if (completePromiseResolve) {
                  completed = true;
                  completePromiseResolve(state);
                }
              } else {
                setState(prev => ({ ...prev, step: 'source-type' }));
                setInput('');
              }
            }
            break;

          case 'preview':
            if (['y', 'n', ''].includes(trimmedInput.toLowerCase())) {
              if (trimmedInput.toLowerCase() === 'y' || trimmedInput === '') {
                setState(prev => ({ ...prev, step: 'done' }));
                if (completePromiseResolve) {
                  completed = true;
                  completePromiseResolve(state);
                }
              } else {
                setState(prev => ({ ...prev, step: 'source-type', previewData: undefined }));
                setInput('');
              }
            }
            break;

          case 'edit-prompt':
            if (trimmedInput) {
              setState(prev => ({ ...prev, editPrompt: trimmedInput, step: 'regenerating' }));
              if (editPromiseResolve && state.previewData) {
                editPromiseResolve({
                  editPrompt: trimmedInput,
                  currentSummary: state.previewData.summary,
                  currentDescription: state.previewData.description
                });
              }
              setInput('');
            }
            break;
        }
      };

      const renderStep = () => {
        switch (state.step) {
          case 'source-type':
            return (
              <Box flexDirection="column" paddingY={1}>
                <Text bold>Select source type:</Text>
                <Text>1. Figma design URL</Text>
                <Text>2. Error log / Bug report</Text>
                <Text>3. Free-form prompt</Text>
              </Box>
            );

          case 'source-input': {
            const label = state.sourceType === 'figma'
              ? 'Enter Figma URL:'
              : state.sourceType === 'log'
                ? 'Enter error log or bug description:'
                : 'Enter your requirements:';
            return (
              <Box flexDirection="column" paddingY={1}>
                <Text bold>{label}</Text>
                <Box borderStyle="single" borderColor="gray" paddingX={1}>
                  <Text color="cyan">&gt; {input}</Text>
                </Box>
              </Box>
            );
          }

          case 'custom':
            return (
              <Box flexDirection="column" paddingY={1}>
                <Text bold>Custom instructions (optional, press Enter to skip):</Text>
                <Text dimColor>Additional requirements or focus areas</Text>
                <Text dimColor>Example: "Focus on accessibility" or "Prioritize performance"</Text>
                <Box borderStyle="single" borderColor="gray" paddingX={1}>
                  <Text color="cyan">&gt; {input}</Text>
                </Box>
              </Box>
            );

          case 'epic':
            return (
              <Box flexDirection="column" paddingY={1}>
                <Text bold>Epic key (optional, press Enter to skip):</Text>
                <Text dimColor>Example: PROJ-123</Text>
                <Box borderStyle="single" borderColor="gray" paddingX={1}>
                  <Text color="cyan">&gt; {input}</Text>
                </Box>
              </Box>
            );

          case 'issue-type':
            return (
              <Box flexDirection="column" paddingY={1}>
                <Text bold>Select issue type:</Text>
                <Text>1. Story (default)</Text>
                <Text>2. Task</Text>
                <Text>3. Bug</Text>
                <Text>4. Epic</Text>
                <Text dimColor>Or type a custom issue type name</Text>
              </Box>
            );

          case 'style':
            return (
              <Box flexDirection="column" paddingY={1}>
                <Text bold>Select prompt style:</Text>
                <Text>1. PM style (user stories, acceptance criteria)</Text>
                <Text>2. Technical style (includes technical considerations)</Text>
              </Box>
            );

          case 'confirm': {
            const sourceLabel = state.sourceType === 'figma'
              ? 'URL'
              : state.sourceType === 'log'
                ? 'Error Log'
                : 'Requirements';
            return (
              <Box flexDirection="column" paddingY={1}>
                <Text bold color="green">Review your configuration:</Text>
                <Box paddingLeft={2} flexDirection="column" paddingY={1}>
                  <Text bold>Source Type:</Text>
                  <Text color="cyan">{state.sourceType}</Text>

                  {state.sourceContent && (
                    <Box flexDirection="column" paddingTop={1}>
                      <Text bold>{sourceLabel}:</Text>
                      <Text color="cyan">{state.sourceContent}</Text>
                    </Box>
                  )}

                  {state.customInstructions && (
                    <Box flexDirection="column" paddingTop={1}>
                      <Text bold>Custom Instructions:</Text>
                      <Text color="cyan">{state.customInstructions}</Text>
                    </Box>
                  )}

                  {state.epicKey && (
                    <Box flexDirection="column" paddingTop={1}>
                      <Text bold>Epic:</Text>
                      <Text color="cyan">{state.epicKey}</Text>
                    </Box>
                  )}

                  <Box flexDirection="column" paddingTop={1}>
                    <Text bold>Issue Type:</Text>
                    <Text color="cyan">{state.issueType}</Text>
                  </Box>

                  <Box flexDirection="column" paddingTop={1}>
                    <Text bold>Prompt Style:</Text>
                    <Text color="cyan">{state.promptStyle}</Text>
                  </Box>
                </Box>
                <Text bold>Continue? (Y/n)</Text>
              </Box>
            );
          }

          case 'generating':
            return (
              <Box flexDirection="column" paddingY={1}>
                <Text bold color="cyan">🤖 Generating task with Claude...</Text>
                <Text dimColor>This may take a moment</Text>
              </Box>
            );

          case 'preview': {
            if (!state.previewData) {
              return (
                <Box flexDirection="column" paddingY={1}>
                  <Text bold color="yellow">Waiting for task preview...</Text>
                </Box>
              );
            }
            return (
              <Box flexDirection="column" paddingY={1}>
                <Box paddingY={1} flexDirection="column">
                  <Text bold>📌 Title:</Text>
                  <Box paddingLeft={2}>
                    <Text color="green">{state.previewData.summary}</Text>
                  </Box>
                </Box>
                <Box flexDirection="column">
                  <Text bold>📝 Description:</Text>
                  <Text dimColor>(Use arrow keys ↑↓ to scroll, PgUp/PgDn for fast scroll)</Text>
                  <Box
                    borderStyle="single"
                    borderColor="gray"
                    paddingX={1}
                    paddingY={1}
                    flexDirection="column"
                    height={25}
                  >
                    <ScrollView ref={scrollViewRef}>
                      <MarkdownText>{state.previewData.description}</MarkdownText>
                    </ScrollView>
                  </Box>
                </Box>
                <Box paddingTop={1}>
                  <Text bold>Create this {state.issueType.toLowerCase()} in Jira? (Y/n) • Press E to edit</Text>
                </Box>
              </Box>
            );
          }

          case 'edit-prompt':
            return (
              <Box flexDirection="column" paddingY={1}>
                <Box paddingY={1} flexDirection="column">
                  <Text bold>📌 Title:</Text>
                  <Box paddingLeft={2}>
                    <Text color="green">{state.previewData?.summary}</Text>
                  </Box>
                </Box>
                <Box flexDirection="column">
                  <Text bold>📝 Current Description:</Text>
                  <Box
                    borderStyle="single"
                    borderColor="gray"
                    paddingX={1}
                    paddingY={1}
                    flexDirection="column"
                    height={15}
                  >
                    <ScrollView ref={scrollViewRef}>
                      <MarkdownText>{state.previewData?.description || ''}</MarkdownText>
                    </ScrollView>
                  </Box>
                </Box>
                <Box paddingTop={1} flexDirection="column">
                  <Text bold color="cyan">What would you like to change?</Text>
                  <Text dimColor>Example: "Add more details about error handling" or "Make it more concise"</Text>
                  <Box borderStyle="single" borderColor="gray" paddingX={1} marginTop={1}>
                    <Text color="cyan">&gt; {input}</Text>
                  </Box>
                </Box>
              </Box>
            );

          case 'regenerating':
            return (
              <Box flexDirection="column" paddingY={1}>
                <Text bold color="cyan">🤖 Updating task description with Claude...</Text>
                <Text dimColor>This may take a moment</Text>
              </Box>
            );

          case 'done':
            return (
              <Box flexDirection="column" paddingY={1}>
                <Text bold color="green">✓ Ready to create!</Text>
                <Text dimColor>Creating task in Jira...</Text>
              </Box>
            );

          case 'success':
            return (
              <Box flexDirection="column" paddingY={1}>
                <Box borderStyle="round" borderColor="green" paddingX={2} paddingY={1}>
                  <Box flexDirection="column">
                    <Text bold color="green">✓ Success!</Text>
                    {state.successMessage && (
                      <Text color="green">{state.successMessage}</Text>
                    )}
                  </Box>
                </Box>
                <Box paddingTop={1}>
                  <Text dimColor>Returning to start in 2 seconds...</Text>
                  <Text dimColor>(or press any key to continue)</Text>
                </Box>
              </Box>
            );

          default:
            return null;
        }
      };

      return (
        <Box flexDirection="column">
          <Box flexDirection="column" borderStyle="round" borderColor="cyan" paddingX={1}>
            <Text bold color="cyan">📋 Claude PM - Interactive Mode</Text>
            <Text dimColor>ESC: Back • Ctrl+C: Exit</Text>
          </Box>
          {renderStep()}
        </Box>
      );
    };

    const { waitUntilExit, unmount } = render(<InteractiveFormWithPreview />);

    waitUntilExit().then(() => {
      if (!completed) {
        reject(new Error('Interactive mode cancelled'));
      }
    });

    const waitForCompletion = (): Promise<InteractiveState> => {
      return new Promise((resolveComplete) => {
        completePromiseResolve = (config) => {
          // Don't unmount - keep UI running for preview
          resolveComplete(config);
        };
      });
    };

    const setGenerating = () => {
      if (updateState) {
        updateState({ step: 'generating' });
      }
    };

    const setPreviewData = (summary: string, description: string) => {
      if (updateState) {
        updateState({ previewData: { summary, description }, step: 'preview' });
      }
    };

    const waitForEdit = (): Promise<{ editPrompt: string; currentSummary: string; currentDescription: string }> => {
      return new Promise((resolveEdit) => {
        editPromiseResolve = resolveEdit;
      });
    };

    const showSuccess = (message: string) => {
      if (updateState) {
        updateState({ successMessage: message, step: 'success' });
        // Auto-restart after 2 seconds
        setTimeout(() => {
          if (updateState) {
            updateState({
              step: 'source-type',
              sourceType: undefined,
              sourceContent: undefined,
              customInstructions: undefined,
              epicKey: undefined,
              previewData: undefined,
              successMessage: undefined,
            });
          }
        }, 2000);
      }
    };

    const restart = () => {
      if (updateState) {
        updateState({
          step: 'source-type',
          sourceType: undefined,
          sourceContent: undefined,
          customInstructions: undefined,
          epicKey: undefined,
          previewData: undefined,
          successMessage: undefined,
        });
      }
    };

    resolve({
      setGenerating,
      setPreviewData,
      waitForCompletion,
      waitForEdit,
      showSuccess,
      restart,
      cleanup: () => {
        unmount();
      },
    });
  });
}
