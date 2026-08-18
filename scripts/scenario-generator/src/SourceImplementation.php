<?php

declare(strict_types=1);

namespace Wwwision\DcbExampleGenerator;

use InvalidArgumentException;

final readonly class SourceImplementation
{
    public function __construct(
        public string $id,
        public string|null $label = null,
        public string|null $language = null,
        public string|null $source = null,
        public string|null $sourceLines = null,
        public string|null $highlightLines = null,
        public string|null $projectName = null,
        public string|null $projectUrl = null,
        public string|null $packageUrl = null,
    ) {
        if ($id === '') {
            throw new InvalidArgumentException('A source implementation requires an id');
        }
    }

    public function merge(self $other): self
    {
        if ($this->id !== $other->id) {
            throw new InvalidArgumentException(sprintf('Cannot merge source implementations "%s" and "%s"', $this->id, $other->id));
        }

        return new self(
            id: $this->id,
            label: $other->label ?? $this->label,
            language: $other->language ?? $this->language,
            source: $other->source ?? $this->source,
            sourceLines: $other->sourceLines ?? $this->sourceLines,
            highlightLines: $other->highlightLines ?? $this->highlightLines,
            projectName: $other->projectName ?? $this->projectName,
            projectUrl: $other->projectUrl ?? $this->projectUrl,
            packageUrl: $other->packageUrl ?? $this->packageUrl,
        );
    }
}
