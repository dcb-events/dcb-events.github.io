package events;

public interface EventSubscriber {

    void onEvent(Event event);

    void onError(Exception exception);

    default void onCheckPoint(Checkpoint checkpoint) {}

}
