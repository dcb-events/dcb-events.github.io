<?php

declare(strict_types=1);

namespace Wwwision\DcbExampleGenerator\commandDefinition;

use Closure;
use IteratorAggregate;
use Traversable;
use Webmozart\Assert\Assert;
use Wwwision\Types\Attributes\ListBased;

use function Wwwision\Types\instantiate;

/**
 * @implements IteratorAggregate<CommandDefinition>
 */
#[ListBased(itemClassName: CommandDefinition::class)]
final readonly class CommandDefinitions implements IteratorAggregate
{
    /**
     * @param array<CommandDefinition> $commandDefinitions
     */
    private function __construct(
        private array $commandDefinitions,
    ) {}

    /**
     * @param array<CommandDefinition> $commandDefinitions
     */
    public static function fromArray(array $commandDefinitions): self
    {
        return instantiate(self::class, $commandDefinitions);
    }

    public static function none(): self
    {
        return self::fromArray([]);
    }

    public function getIterator(): Traversable
    {
        yield from array_values($this->commandDefinitions);
    }

    public function get(string $commandName): CommandDefinition
    {
        $candidate = $this->findByCommandName($commandName);
        Assert::notNull($candidate, sprintf('Unknown command type "%s"', $commandName));
        return $candidate;
    }

    public function exists(string $commandName): bool
    {
        return $this->findByCommandName($commandName) !== null;
    }

    /**
     * @template T
     * @param Closure(CommandDefinition): T $callback
     * @return array<T>
     */
    public function map(Closure $callback): array
    {
        return array_map($callback, $this->commandDefinitions);
    }

    public function only(string ...$commandNames): self
    {
        return self::fromArray(array_filter($this->commandDefinitions, static fn(CommandDefinition $commandDefinition) => in_array($commandDefinition->name, $commandNames)));
    }

    public function with(CommandDefinition $commandDefinition): self
    {
        return self::fromArray(array_merge(
            array_filter($this->commandDefinitions, static fn(CommandDefinition $existingCommandDefinition) => $existingCommandDefinition->name !== $commandDefinition->name),
            [$commandDefinition],
        ));
    }

    private function findByCommandName(string $commandName): CommandDefinition|null
    {
        return array_find($this->commandDefinitions, static fn(CommandDefinition $commandDefinition) => $commandDefinition->name === $commandName);
    }

    /**
     * @return array<string>
     */
    public function names(): array
    {
        return $this->map(static fn(CommandDefinition $commandDefinition) => $commandDefinition->name);
    }

    public function merge(self $other): self
    {
        return self::fromArray(array_merge(
            array_filter($this->commandDefinitions, static fn(CommandDefinition $commandDefinition) => !in_array($commandDefinition->name, $other->names())),
            $other->commandDefinitions,
        ));
    }
}
