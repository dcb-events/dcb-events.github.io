<?php

declare(strict_types=1);

namespace Wwwision\DcbExampleGenerator\projection;

use IteratorAggregate;
use Traversable;
use Webmozart\Assert\Assert;
use Wwwision\Types\Attributes\ListBased;

use function Wwwision\Types\instantiate;

/**
 * @implements IteratorAggregate<ProjectionHandler>
 */
#[ListBased(itemClassName: ProjectionHandler::class)]
final readonly class ProjectionHandlers implements IteratorAggregate
{
    /**
     * @param array<string, ProjectionHandler> $handlers in the form ['<EventType>' => '<code>', ...], for example ['CourseDefined' => 'event.data.capacity', 'StudentSubscribedToCourse' => 'state + 1']
     */
    private function __construct(
        public array $handlers,
    ) {
    }

    /**
     * @param array<string, ProjectionHandler|string> $handlers
     */
    public static function fromArray(array $handlers): self
    {
        Assert::isMap($handlers, 'Handlers must be indexed by event type (string)');
        return instantiate(self::class, $handlers);
    }

    public function with(string $eventType, string $projectionCode): self
    {
        Assert::notStartsWith($eventType, '$', 'Virtual event types are not allowed');
        Assert::keyNotExists($this->handlers, $eventType, 'Handler for event type "%s" already exists');
        return self::fromArray([...$this->handlers, ...[$eventType => $projectionCode]]);
    }

    public function getIterator(): Traversable
    {
        yield from $this->handlers;
    }

    /**
     * @return array<string>
     */
    public function eventTypes(): array
    {
        return array_keys($this->handlers);
    }
}
