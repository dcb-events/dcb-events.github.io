package events;

public interface EventSubscriber {

    void onEvent(SequencedEvent event);

    void onError(Exception exception);

    default void onCheckPoint(Checkpoint checkpoint) {}

}
