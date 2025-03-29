<?php

declare(strict_types=1);

namespace Wwwision\DcbExampleGenerator\shared;

use Webmozart\Assert\Assert;

final readonly class TemplateString
{
    private function __construct(
        private string $template,
    ) {}

    public static function parse(string $template): self
    {
        return new self($template);
    }

    /**
     * Renders the template as string, replacing placeholders with the given variables.
     * Variables can contain nested arrays and/or objects, the placeholders can address them via path-syntax (e.g. "foo.bar.baz").
     * @param array<mixed> $variables
     */
    public function render(array $variables): string
    {
        $tokens = $this->getTokens();
        $replacements = [];
        foreach ($tokens as $token) {
            $replacements['{' . $token . '}'] = $this->resolveToken($token, $variables);
        }
        return strtr($this->template, $replacements);
    }

    /**
     * @return array<string>
     */
    public function getTokens(): array
    {
        preg_match_all('/\{([^}]+)}/', $this->template, $matches);
        return $matches[1];
    }

    /**
     * @param array<mixed> $variables
     */
    private function resolveToken(string $token, array $variables): string
    {
        $parts = explode('.', $token);
        $value = $variables;
        foreach ($parts as $part) {
            if (is_array($value)) {
                Assert::keyExists($value, $part, 'Missing array key "%s" for token "' . $token . '"');
                $value = $value[$part];
                continue;
            }
            if (is_object($value)) {
                Assert::propertyExists($value, $part, 'Missing property "%s" for token "' . $token . '"');
                $value = $value->$part;
                continue;
            }
            throw new \InvalidArgumentException(sprintf('Invalid variable "%s" for token "%s", expected array or object, got %s', $part, $token, get_debug_type($value)), 1741347096);
        }
        return (string) $value;
    }

    public function toJsTemplateString(): string
    {
        $tokens = $this->getTokens();
        if ($tokens === []) {
            return '"' . $this->template . '"';
        }
        if (count($tokens) === 1 && '{' . $tokens[0] . '}' === $this->template) {
            return $tokens[0];
        }
        return '`' . str_replace(['{', '}'], ['${', '}'], $this->template) . '`';
    }

}
