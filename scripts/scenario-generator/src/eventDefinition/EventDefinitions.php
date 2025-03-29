<?php

declare(strict_types=1);

namespace Wwwision\DcbExampleGenerator\eventDefinition;

use Closure;
use IteratorAggregate;
use Traversable;
use Webmozart\Assert\Assert;
use Wwwision\Types\Attributes\ListBased;

use function Wwwision\Types\instantiate;

/**
 * @implements IteratorAggregate<EventDefinition>
 */
#[ListBased(itemClassName: EventDefinition::class)]
final readonly class EventDefinitions implements IteratorAggregate
{
    /**
     * @param array<EventDefinition> $eventDefinitions
     */
    private function __construct(
        private array $eventDefinitions,
    ) {
    }

    /**
     * @param array<EventDefinition> $eventDefinitions
     */
    public static function fromArray(array $eventDefinitions): self
    {
        return instantiate(self::class, $eventDefinitions);
    }

    public function getIterator(): Traversable
    {
        yield from array_values($this->eventDefinitions);
    }

    public function get(string $eventType): EventDefinition
    {
        $candidate = $this->findByEventType($eventType);
        Assert::notNull($candidate, sprintf('Unknown event type "%s"', $eventType));
        return $candidate;
    }

    /**
     * @template T
     * @param Closure(EventDefinition): T $callback
     * @return array<T>
     */
    public function map(Closure $callback): array
    {
        return array_map($callback, $this->eventDefinitions);
    }

    public function exists(string $eventType): bool
    {
        return $this->findByEventType($eventType) !== null;
    }

    public function only(string ...$eventTypes): self
    {
        return self::fromArray(array_filter($this->eventDefinitions, static fn (EventDefinition $eventDefinition) => in_array($eventDefinition->name, $eventTypes)));
    }

    private function findByEventType(string $eventType): EventDefinition|null
    {
        return array_find($this->eventDefinitions, static fn (EventDefinition $eventDefinition) => $eventDefinition->name === $eventType);
    }
}
