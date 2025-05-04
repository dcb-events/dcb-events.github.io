<?php

declare(strict_types=1);

namespace Wwwision\DcbExampleGenerator\commandHandlerDefinition;

use Closure;
use IteratorAggregate;
use Traversable;
use Webmozart\Assert\Assert;
use Wwwision\Types\Attributes\ListBased;

use function Wwwision\Types\instantiate;

/**
 * @implements IteratorAggregate<CommandHandlerDefinition>
 */
#[ListBased(itemClassName: CommandHandlerDefinition::class)]
final readonly class CommandHandlerDefinitions implements IteratorAggregate
{
    /**
     * @param array<CommandHandlerDefinition> $commandHandlerDefinitions
     */
    private function __construct(
        private array $commandHandlerDefinitions,
    ) {}

    /**
     * @param array<CommandHandlerDefinition> $commandHandlerDefinitions
     */
    public static function fromArray(array $commandHandlerDefinitions): self
    {
        return instantiate(self::class, $commandHandlerDefinitions);
    }

    public static function none(): self
    {
        return self::fromArray([]);
    }

    public function getIterator(): Traversable
    {
        yield from array_values($this->commandHandlerDefinitions);
    }

    /**
     * @template T
     * @param Closure(CommandHandlerDefinition): T $callback
     * @return array<T>
     */
    public function map(Closure $callback): array
    {
        return array_map($callback, $this->commandHandlerDefinitions);
    }

    public function exists(string $commandName): bool
    {
        return $this->findByCommandName($commandName) !== null;
    }

    public function getForCommand(string $commandName): CommandHandlerDefinition
    {
        $candidate = $this->findByCommandName($commandName);
        Assert::notNull($candidate, sprintf('Unknown command handler "%s"', $commandName));
        return $candidate;
    }

    public function onlyForCommands(string ...$commandNames): self
    {
        return self::fromArray(array_filter($this->commandHandlerDefinitions, static fn(CommandHandlerDefinition $commandHandlerDefinition) => in_array($commandHandlerDefinition->commandName, $commandNames)));
    }

    public function with(CommandHandlerDefinition $commandHandlerDefinition): self
    {
        return self::fromArray(array_merge(
            array_filter($this->commandHandlerDefinitions, static fn(CommandHandlerDefinition $existingCommandHandlerDefinition) => $existingCommandHandlerDefinition->commandName !== $commandHandlerDefinition->commandName),
            [$commandHandlerDefinition],
        ));
    }

    private function findByCommandName(string $commandName): CommandHandlerDefinition|null
    {
        return array_find($this->commandHandlerDefinitions, static fn(CommandHandlerDefinition $commandHandlerDefinition) => $commandHandlerDefinition->commandName === $commandName);
    }

    /**
     * @return array<string>
     */
    public function commandNames(): array
    {
        return $this->map(static fn(CommandHandlerDefinition $commandHandlerDefinition) => $commandHandlerDefinition->commandName);
    }

    public function merge(self $other): self
    {
        return self::fromArray(array_merge(
            array_filter($this->commandHandlerDefinitions, static fn(CommandHandlerDefinition $commandHandlerDefinition) => !in_array($commandHandlerDefinition->commandName, $other->commandNames())),
            $other->commandHandlerDefinitions,
        ));
    }

}
