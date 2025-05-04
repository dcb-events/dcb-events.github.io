<?php

declare(strict_types=1);

namespace Wwwision\DcbExampleGenerator;

final class Output
{
    /**
     * @var array<string>
     */
    public array $lines = [];

    /**
     * @var array<int>
     */
    public array $highlightedLineNumbers = [];

    private bool $isHighlighting = false;

    public function __construct(
    ) {}

    public function addLine(string $line = ''): void
    {
        $this->lines[] = $line;
        if ($this->isHighlighting) {
            $this->highlightedLineNumbers[] = count($this->lines);
        }
    }

    public function startHighlighting(): void
    {
        $this->isHighlighting = true;
    }

    public function endHighlighting(): void
    {
        $this->isHighlighting = false;
    }

    public function render(int $indent = 0): string
    {
        $indentString = str_repeat(' ', $indent);
        return $indentString . implode(chr(10) . $indentString, $this->lines);
    }

}
