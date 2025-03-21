package events;

public interface SequencedEvent {

    SequencePosition sequencePosition();

    Event event();
}
