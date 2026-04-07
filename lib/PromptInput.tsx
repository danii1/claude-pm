import { Box, Text } from 'ink';
import TextInput from 'ink-text-input';

interface PromptInputProps {
  value: string;
  onChange: (value: string) => void;
  marginTop?: number;
}

export function PromptInput({ value, onChange, marginTop }: PromptInputProps) {
  return (
    <Box borderStyle="single" borderColor="gray" paddingX={1} marginTop={marginTop}>
      <Text color="cyan">&gt; </Text>
      <TextInput value={value} onChange={onChange} />
    </Box>
  );
}
