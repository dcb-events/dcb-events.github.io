<?php

declare(strict_types=1);

namespace Wwwision\DcbExampleGenerator\eventDefinition;

use Wwwision\TypesJSONSchema\Types\Schema;

final readonly class EventDefinition
{
    /**
     * @param array<string> $tagResolvers array in the form ['hard-coded-tag', 'tag-with-{placeholder}'] (e.g. ['{event.data.courseId}'])
     */
    public function __construct(
        public string $name,
        public Schema $schema,
        public array $tagResolvers,
        public string|null $icon = null,
    ) {}
}
